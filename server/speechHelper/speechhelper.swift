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
//     warm [<locale>]    get ready for a later start (build the recognizer
//                        for that locale) without opening the mic and
//                        without ever raising a permission prompt
//     start [<locale>]   begin listening; locale is BCP-47, e.g. "en-US"
//                        (default) or "tr-TR"
//     stop               stop listening (after a short tail, see
//                        stopTailSeconds); a {"type":"final"} line follows
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
    // A fresh engine per utterance (see beginListening) - a reused one
    // hands over a stale non-silent buffer from the previous utterance
    // before the input device has woken up again, which defeats the
    // "is the mic really live yet" check in the tap.
    private var audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var listening = false
    // Bumped on every beginListening - callbacks and delayed work that
    // belong to an earlier utterance check it and bow out, so a quick
    // re-press can't be torn down by the previous utterance's leftovers
    // (its cancel error, or its delayed stop).
    private var session = 0
    // A stop that arrived while the first-ever start was still waiting on
    // the permission prompt - honoured once that resolves, instead of
    // being dropped and leaving the mic open with nothing to stop it.
    private var startPending = false
    private var stopRequested = false
    // Recognizers are kept between utterances (and built ahead of time by
    // `warm`) rather than recreated on every press.
    private var recognizers: [String: SFSpeechRecognizer] = [:]
    private var timing: [String: Any]?

    /// False for a buffer of exact (or near-exact) digital silence - what
    /// an input device delivers before it's really running.
    static func hasSignal(_ buffer: AVAudioPCMBuffer) -> Bool {
        guard let data = buffer.floatChannelData else { return true }
        let samples = data[0]
        for i in 0..<Int(buffer.frameLength) where abs(samples[i]) > 1e-6 { return true }
        return false
    }
    // How long the mic stays open after `stop`, so a last word spoken as
    // the button is released isn't clipped.
    private let stopTailSeconds = 0.3

    private func recognizer(for id: String) -> SFSpeechRecognizer? {
        if let rec = recognizers[id] { return rec }
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: id)) else { return nil }
        recognizers[id] = rec
        return rec
    }

    /// Do the slow setup ahead of the first press. Never prompts: it only
    /// notes permission that has ALREADY been granted (so `start` can skip
    /// the round trip), and never touches the audio input.
    func warm(locale localeID: String) {
        let id = localeID.isEmpty ? "en-US" : localeID
        _ = recognizer(for: id)
        if SFSpeechRecognizer.authorizationStatus() == .authorized
            && AVCaptureDevice.authorizationStatus(for: .audio) == .authorized {
            authorized = true
        }
    }

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
            startPending = true
            stopRequested = false
            requestAuthorization { [weak self] granted in
                guard let self = self else { return }
                self.startPending = false
                if granted {
                    self.authorized = true
                    if self.stopRequested {
                        // Released before permission came back - nothing was heard.
                        emit(["type": "final", "text": ""])
                    } else {
                        self.beginListening(locale: localeID)
                    }
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
        guard let rec = recognizer(for: id) else {
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

        audioEngine = AVAudioEngine()
        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        // "listening" is reported when the mic is delivering real sound,
        // not when audioEngine.start() returns and not on the first buffer
        // either - an input device that's still waking up hands over
        // buffers of exact digital silence first (a live mic always has
        // some noise in it), and the widget tells the user to start
        // talking on this message.
        session += 1
        let mySession = session
        let onDevice = rec.supportsOnDeviceRecognition
        let t0 = Date()
        // Only touched on the audio thread.
        var announced = false
        var firstBufferMs = -1
        var signalRun = 0
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
            if announced { return }
            let ms = Int(Date().timeIntervalSince(t0) * 1000)
            if firstBufferMs < 0 { firstBufferMs = ms }
            // Two in a row, so one stray non-silent buffer ahead of the
            // device's real start can't trip it.
            signalRun = SpeechHelper.hasSignal(buffer) ? signalRun + 1 : 0
            guard signalRun >= 2 else { return }
            announced = true
            let bufferMs = firstBufferMs
            DispatchQueue.main.async {
                guard let self = self, self.listening, self.session == mySession else { return }
                self.timing = ["type": "timing", "firstBufferMs": bufferMs, "firstSignalMs": ms]
                emit(["type": "listening", "onDevice": onDevice, "locale": id])
            }
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

        task = rec.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self, self.session == mySession else { return }
            if let result = result {
                // One line per utterance in NTK's console: how long the mic
                // took to deliver anything, to deliver real sound, and how
                // long until the recognizer produced its first words.
                if var t = self.timing {
                    self.timing = nil
                    t["firstResultMs"] = Int(Date().timeIntervalSince(t0) * 1000)
                    emit(t)
                }
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
        if startPending { stopRequested = true }
        guard listening else { return }
        let mySession = session
        DispatchQueue.main.asyncAfter(deadline: .now() + stopTailSeconds) { [weak self] in
            guard let self = self, self.listening, self.session == mySession else { return }
            self.audioEngine.stop()
            self.audioEngine.inputNode.removeTap(onBus: 0)
            self.request?.endAudio()
            // finish() runs when the final result / error arrives in the task callback.
        }
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
        case "warm":    DispatchQueue.main.async { helper.warm(locale: arg) }
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
