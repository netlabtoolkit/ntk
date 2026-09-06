// NTK TTS Helper
//
// Drives Apple's AVSpeechSynthesizer for the SpeechOut widget - Electron's
// Chromium speechSynthesis on macOS only reaches the base-quality system
// voices (NSSpeechSynthesizer path); AVSpeechSynthesizer reaches the
// Enhanced / Premium / neural voices (the ones Siri and VoiceOver use).
// Output-only - no microphone, no TCC prompt, no embedded Info.plist.
//
// Protocol:
//   stdin  (one command per line):
//     speak {"text":"...","voice":"<id>","rate":0.5,"pitch":1.0}
//                        rate 0..1 (0.5 ~ natural), pitch 0.5..2
//     stop
//     voices             re-emit the voice list
//     quit
//   stdout (one JSON object per line):
//     {"type":"starting"}
//     {"type":"voices","voices":[{"id","name","lang","quality"}...]}
//     {"type":"started"}
//     {"type":"word","location":N,"length":M}
//     {"type":"done"[,"cancelled":true]}
//     {"type":"error","message":"..."}

import Foundation
import AVFoundation

func emit(_ obj: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(obj),
          let data = try? JSONSerialization.data(withJSONObject: obj),
          let line = String(data: data, encoding: .utf8) else { return }
    FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

final class TTSHelper: NSObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()

    override init() {
        super.init()
        synth.delegate = self
    }

    func reportVoices() {
        let voices = AVSpeechSynthesisVoice.speechVoices().map { v -> [String: Any] in
            let quality: String
            switch v.quality {
            case .premium: quality = "premium"
            case .enhanced: quality = "enhanced"
            default: quality = "default"
            }
            return ["id": v.identifier, "name": v.name, "lang": v.language, "quality": quality]
        }
        emit(["type": "voices", "voices": voices])
    }

    func speak(text: String, voiceId: String?, rate: Double?, pitch: Double?) {
        synth.stopSpeaking(at: .immediate)
        guard !text.isEmpty else { return }
        let u = AVSpeechUtterance(string: text)
        if let vid = voiceId, !vid.isEmpty, let v = AVSpeechSynthesisVoice(identifier: vid) {
            u.voice = v
        }
        if let r = rate { u.rate = max(AVSpeechUtteranceMinimumSpeechRate, min(AVSpeechUtteranceMaximumSpeechRate, Float(r))) }
        if let p = pitch { u.pitchMultiplier = max(0.5, min(2.0, Float(p))) }
        synth.speak(u)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }

    func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart u: AVSpeechUtterance) {
        emit(["type": "started"])
    }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        emit(["type": "done"])
    }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) {
        emit(["type": "done", "cancelled": true])
    }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, willSpeakRangeOfSpeechString range: NSRange, utterance u: AVSpeechUtterance) {
        emit(["type": "word", "location": range.location, "length": range.length])
    }
}

let helper = TTSHelper()
emit(["type": "starting"])
helper.reportVoices()

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { continue }
        let parts = trimmed.split(separator: " ", maxSplits: 1).map(String.init)
        let cmd = parts[0]
        let arg = parts.count > 1 ? parts[1] : ""
        switch cmd {
        case "speak":
            if let data = arg.data(using: .utf8),
               let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                let text = obj["text"] as? String ?? ""
                let voice = obj["voice"] as? String
                let rate = obj["rate"] as? Double
                let pitch = obj["pitch"] as? Double
                DispatchQueue.main.async { helper.speak(text: text, voiceId: voice, rate: rate, pitch: pitch) }
            } else {
                emit(["type": "error", "message": "speak: bad JSON"])
            }
        case "stop":   DispatchQueue.main.async { helper.stop() }
        case "voices": DispatchQueue.main.async { helper.reportVoices() }
        case "quit":   exit(0)
        default:       emit(["type": "error", "message": "unknown command: \(cmd)"])
        }
    }
    exit(0) // stdin closed - parent is gone
}

RunLoop.main.run()
