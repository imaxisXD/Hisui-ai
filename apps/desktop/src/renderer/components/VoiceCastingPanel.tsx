import type { SpeakerProfile, TtsModel, VoiceDefinition } from "../../shared/types";
import { HisuiButton } from "./HisuiButton";

interface ActiveVoicePreview {
  speakerId: string;
  model: TtsModel;
  voiceId: string;
  cacheKey: string;
}

interface VoiceCastingPanelProps {
  speakers: SpeakerProfile[];
  voices: VoiceDefinition[];
  onChange(speakers: SpeakerProfile[]): void;
  onPreview(input: { speakerId: string; model: TtsModel; voiceId: string }): Promise<void>;
  previewLoading: ActiveVoicePreview | null;
  previewPlaying: ActiveVoicePreview | null;
  previewError: string | null;
  onSave(): Promise<void>;
  saveState: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
}

function voiceOptionsForModel(voices: VoiceDefinition[], model: SpeakerProfile["ttsModel"]) {
  return voices.filter((voice) => voice.model === model);
}

function availableModels(voices: VoiceDefinition[]): SpeakerProfile["ttsModel"][] {
  const values = new Set<SpeakerProfile["ttsModel"]>();
  for (const voice of voices) {
    values.add(voice.model);
  }
  return [...values];
}

const SPEAKER_COLORS = [
  "var(--voice-1)",
  "var(--voice-2)",
  "var(--voice-3)",
  "var(--voice-4)",
  "var(--voice-5)",
  "var(--voice-6)"
];

export function VoiceCastingPanel(props: VoiceCastingPanelProps) {
  const models = availableModels(props.voices);

  const addSpeaker = () => {
    if (props.speakers.length >= 6) {
      return;
    }
    const fallbackVoice = props.voices.find((voice) => voice.model === "kokoro") ?? props.voices[0];
    if (!fallbackVoice) {
      return;
    }
    props.onChange([
      ...props.speakers,
      {
        id: crypto.randomUUID(),
        name: `Speaker ${props.speakers.length + 1}`,
        ttsModel: fallbackVoice.model,
        voiceId: fallbackVoice.id
      }
    ]);
  };

  const removeSpeaker = (speakerId: string) => {
    if (props.speakers.length <= 1) {
      return;
    }
    props.onChange(props.speakers.filter((speaker) => speaker.id !== speakerId));
  };

  return (
    <section className="panel panel-voices">
      <div className="voices-toolbar">
        <div className="voices-toolbar-left">
          <p className="eyebrow">Stage 03 &mdash; Voice Casting</p>
          <h2>Assign voices</h2>
          <p className="voices-sub">
            Name your speakers, pick a TTS engine and voice for each. Up to 6 speakers.
          </p>
        </div>
        <div className="voices-toolbar-right">
          {props.saveState === "saved" ? (
            <span className="save-indicator save-indicator--ok">Saved</span>
          ) : null}
          {props.saveError ? (
            <span className="save-indicator save-indicator--err">Error</span>
          ) : null}
          {props.previewError ? (
            <span className="save-indicator save-indicator--err">Preview Error</span>
          ) : null}
          <HisuiButton variant="ghost" onClick={addSpeaker} disabled={props.speakers.length >= 6}>
            + Add Voice
          </HisuiButton>
          <HisuiButton variant="primary" loading={props.saveState === "saving"} loadingText="Saving\u2026" onClick={() => void props.onSave()}>
            Save Casting
          </HisuiButton>
        </div>
      </div>

      <div className="voice-grid">
        {props.speakers.map((speaker, idx) => {
          const hasActiveModel = models.includes(speaker.ttsModel);
          const activeModel = hasActiveModel ? speaker.ttsModel : (models[0] ?? "kokoro");
          const options = voiceOptionsForModel(props.voices, activeModel);
          const selectedVoiceId = options.some((voice) => voice.id === speaker.voiceId) ? speaker.voiceId : (options[0]?.id ?? "");
          const isPreviewLoading = props.previewLoading?.speakerId === speaker.id
            && props.previewLoading.model === activeModel
            && props.previewLoading.voiceId === selectedVoiceId;
          const isPreviewPlaying = props.previewPlaying?.speakerId === speaker.id
            && props.previewPlaying.model === activeModel
            && props.previewPlaying.voiceId === selectedVoiceId;
          const previewEnabled = activeModel === "kokoro" && Boolean(selectedVoiceId);
          const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];

          return (
            <article
              className="voice-card"
              key={speaker.id}
              style={{ "--card-accent": color } as React.CSSProperties}
            >
              <div className="voice-card-indicator" />
              <div className="voice-card-body">
                <div className="voice-card-row">
                  <label className="voice-field">
                    <span className="voice-field-label">Name</span>
                    <input
                      value={speaker.name}
                      onChange={(event) => {
                        props.onChange(props.speakers.map((item) => (
                          item.id === speaker.id ? { ...item, name: event.target.value } : item
                        )));
                      }}
                    />
                  </label>
                </div>

                <div className="voice-card-row voice-card-row--split">
                  <label className="voice-field">
                    <span className="voice-field-label">Engine</span>
                    <select
                      value={activeModel}
                      onChange={(event) => {
                        const nextModel = event.target.value as SpeakerProfile["ttsModel"];
                        const nextVoice = props.voices.find((voice) => voice.model === nextModel) ?? props.voices[0];
                        props.onChange(props.speakers.map((item) => (
                          item.id === speaker.id
                            ? { ...item, ttsModel: nextModel, voiceId: nextVoice?.id ?? item.voiceId }
                            : item
                        )));
                      }}
                    >
                      {models.map((model) => (
                        <option key={model} value={model}>{model === "chatterbox" ? "Chatterbox" : "Kokoro"}</option>
                      ))}
                    </select>
                  </label>

                  <label className="voice-field">
                    <span className="voice-field-label">Voice</span>
                    <select
                      value={selectedVoiceId}
                      onChange={(event) => {
                        props.onChange(props.speakers.map((item) => (
                          item.id === speaker.id ? { ...item, voiceId: event.target.value } : item
                        )));
                      }}
                    >
                      {options.map((voice) => (
                        <option key={voice.id} value={voice.id}>{voice.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="voice-card-actions">
                  <HisuiButton
                    variant="ghost"
                    size="sm"
                    className="voice-preview"
                    loading={Boolean(isPreviewLoading)}
                    loadingText="Loading\u2026"
                    onClick={() => void props.onPreview({
                      speakerId: speaker.id,
                      model: activeModel,
                      voiceId: selectedVoiceId
                    })}
                    disabled={!previewEnabled}
                  >
                    {isPreviewPlaying ? "Stop Preview" : "Play Preview"}
                  </HisuiButton>
                  <HisuiButton
                    variant="ghost"
                    size="sm"
                    className="voice-remove"
                    onClick={() => removeSpeaker(speaker.id)}
                    disabled={props.speakers.length <= 1}
                  >
                    Remove
                  </HisuiButton>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
