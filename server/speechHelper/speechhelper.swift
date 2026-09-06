// NTK Speech Helper
//
// A tiny CLI that drives Apple's Speech framework (SFSpeechRecognizer) for
// the SpeechIn widget - the Web Speech Recognition API doesn't exist in
// Electron's Chromium, and there's no Node binding for the Speech
// framework, so NTK's main process spawns this and talks to it over
// stdin/stdout.
//
// Protocol:
//   stdin  (one command per line):
//     start [<locale>]   begin listening; locale is BCP-47, e.g. "en-US"
//                        (default) or "tr-TR"
//     stop               stop listening; a {"type":"final"} line follows
//     quit               exit
//   stdout (one JSON object per line):
//     {"type":"starting"}
//     {"type":"auth","granted":bool,"speechStatus":int}
//     {"type":"listening","onDevice":bool,"locale":"en-US"}
//     {"type":"partial","text":"..."}
//     {"type":"final","text":"..."}
//     {"type":"error","message":"..."}
//
// Build (see buildScripts/buildSpeechHelper.sh):
//   swiftc -O speechhelper.swift -o speechhelper \
//     -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist \
//     -Xlinker Info.plist

import Foundation
import Speech
import AVFoundation

func emit(_ obj: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(obj),
          let data = try? JSONSerialization.data(withJSONObject: obj),
          let line = String(data: data, encoding: .utf8) else { return }
    FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

final class SpeechHelper {
    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var listening = false

    func requestAuthorization(_ completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { speechStatus in
            let speechOK = (speechStatus == .authorized)
            AVCaptureDevice.requestAccess(for: .audio) { micOK in
                DispatchQueue.main.async {
                    emit(["type": "auth",
                          "granted": speechOK && micOK,
                          "speechStatus": speechStatus.rawValue])
                    completion(speechOK && micOK)
                }
            }
        }
    }

    // Auth is requested here on the first `start`, NOT at launch - so a
    // helper spawned just to list supported locales doesn't fire the
    // mic / speech-recognition permission prompts.
    private var authorized = false
    func start(locale localeID: String) {
        if authorized {
            beginListening(locale: localeID)
        } else {
            requestAuthorization { [weak self] granted in
                if granted {
                    self?.authorized = true
                    self?.beginListening(locale: localeID)
                } else {
                    emit(["type": "error", "message": "microphone or speech-recognition permission was denied"])
                    emit(["type": "final", "text": ""])
                }
            }
        }
    }

    private func beginListening(locale localeID: String) {
        if listening { forceStop() }

        let id = localeID.isEmpty ? "en-US" : localeID
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: id)) else {
            emit(["type": "error", "message": "no recognizer for locale \"\(id)\""])
            return
        }
        guard rec.isAvailable else {
            emit(["type": "error", "message": "recognizer for \"\(id)\" is not available right now"])
            return
        }
        recognizer = rec

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        // Force on-device when the language model is installed - avoids the
        // network round-trip, the ~1-minute-per-utterance server cap, and
        // per-device throttling. Falls back to server recognition only
        // when there's no on-device model for this locale.
        if rec.supportsOnDeviceRecognition {
            req.requiresOnDeviceRecognition = true
        }
        request = req

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }
        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            emit(["type": "error", "message": "audio engine failed to start: \(error.localizedDescription)"])
            cleanupAudio()
            return
        }

        listening = true
        emit(["type": "listening",
              "onDevice": rec.supportsOnDeviceRecognition,
              "locale": id])

        task = rec.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                let text = result.bestTranscription.formattedString
                emit(["type": result.isFinal ? "final" : "partial", "text": text])
                if result.isFinal { self.finish() }
            }
            if let error = error {
                // A "no speech detected" style error after stop() is
                // routine - report it but still emit a final so the
                // widget isn't left hanging.
                emit(["type": "error", "message": error.localizedDescription])
                if self.listening { emit(["type": "final", "text": ""]) }
                self.finish()
            }
        }
    }

    /// Graceful stop: end audio input, let the recognizer deliver a final.
    func stop() {
        guard listening else { return }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        // finish() runs when the final result / error arrives in the task callback.
    }

    /// Hard reset (used when start is called while already listening).
    private func forceStop() {
        task?.cancel()
        cleanupAudio()
        request = nil
        task = nil
        listening = false
    }

    private func finish() {
        cleanupAudio()
        request = nil
        task = nil
        listening = false
    }

    private func cleanupAudio() {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)
    }
}

func reportLocales() {
    let locales = SFSpeechRecognizer.supportedLocales()
        .map { $0.identifier }
        .sorted()
    emit(["type": "locales", "locales": locales])
}

// ---- main ----

let helper = SpeechHelper()
emit(["type": "starting"])
reportLocales()
// Permission is requested lazily on the first `start` command (see
// SpeechHelper.start) so listing locales doesn't trigger a TCC prompt.

// Read commands off stdin on a background thread; the main thread runs the
// run loop that AVAudioEngine / SFSpeechRecognizer callbacks need.
DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { continue }
        let parts = trimmed.split(separator: " ", maxSplits: 1).map(String.init)
        let cmd = parts[0]
        let arg = parts.count > 1 ? parts[1].trimmingCharacters(in: .whitespaces) : ""
        switch cmd {
        case "start":   DispatchQueue.main.async { helper.start(locale: arg) }
        case "stop":    DispatchQueue.main.async { helper.stop() }
        case "locales": reportLocales()
        case "quit":    exit(0)
        default:        emit(["type": "error", "message": "unknown command: \(cmd)"])
        }
    }
    // stdin closed - parent process is gone.
    exit(0)
}

RunLoop.main.run()
