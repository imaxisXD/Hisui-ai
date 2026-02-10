import { cn } from "../lib/utils";
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

const eyebrowClass = "text-[0.65rem] font-geist-mono uppercase tracking-[0.12em] text-ui-text-muted";
const saveIndicatorBaseClass = "inline-flex items-center gap-[0.3rem] rounded-[3px] px-[0.5rem] py-[0.2rem] font-geist-mono text-[0.72rem] uppercase tracking-[0.06em]";
const fieldLabelClass = "font-geist-mono text-[0.65rem] uppercase tracking-[0.1em] text-ui-text-muted";
const fieldClass = "w-full rounded border border-ui-border-strong bg-ui-bg-input px-[0.7rem] py-[0.5rem] text-[0.85rem] text-ui-text-primary transition-[border-color,box-shadow] duration-150 focus:border-ui-accent focus:outline-none focus:ring-[3px] focus:ring-ui-accent-soft";

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
    <section className="flex flex-col rounded-lg border border-ui-border bg-ui-bg-panel shadow-ui-sm animate-[panelReveal_240ms_ease]">
      <div className="flex items-start justify-between gap-4 border-b border-ui-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <p className={eyebrowClass}>Stage 03 - Voice Casting</p>
          <h2 className="m-0 text-[1.15rem]">Assign voices</h2>
          <p className="m-0 text-[0.82rem] text-ui-text-secondary">
            Name your speakers, pick a TTS engine and voice for each. Up to 6 speakers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {props.saveState === "saved" ? (
            <span className={cn(saveIndicatorBaseClass, "bg-ui-success-soft-10 text-ui-success")}>Saved</span>
          ) : null}
          {props.saveError ? (
            <span className={cn(saveIndicatorBaseClass, "bg-ui-error-soft-10 text-ui-error")}>Error</span>
          ) : null}
          {props.previewError ? (
            <span className={cn(saveIndicatorBaseClass, "bg-ui-error-soft-10 text-ui-error")}>Preview Error</span>
          ) : null}
          <HisuiButton variant="ghost" onClick={addSpeaker} disabled={props.speakers.length >= 6}>
            + Add Voice
          </HisuiButton>
          <HisuiButton variant="primary" loading={props.saveState === "saving"} loadingText="Saving..." onClick={() => void props.onSave()}>
            Save Casting
          </HisuiButton>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-5 max-[640px]:grid-cols-1">
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
              className="flex overflow-hidden rounded-md border border-ui-border bg-ui-bg-card transition-[border-color] duration-150 focus-within:border-ui-accent-ghost-border"
              key={speaker.id}
            >
              <div className="w-1 shrink-0" style={{ backgroundColor: color }} />
              <div className="flex flex-1 flex-col gap-[0.55rem] p-[0.85rem]">
                <div className="flex flex-col gap-[0.4rem]">
                  <label className="flex flex-col gap-[0.2rem]">
                    <span className={fieldLabelClass}>Name</span>
                    <input
                      className={fieldClass}
                      value={speaker.name}
                      onChange={(event) => {
                        props.onChange(props.speakers.map((item) => (
                          item.id === speaker.id ? { ...item, name: event.target.value } : item
                        )));
                      }}
                    />
                  </label>
                </div>

                <div className="flex gap-[0.55rem]">
                  <label className="flex flex-1 flex-col gap-[0.2rem]">
                    <span className={fieldLabelClass}>Engine</span>
                    <select
                      className={fieldClass}
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

                  <label className="flex flex-1 flex-col gap-[0.2rem]">
                    <span className={fieldLabelClass}>Voice</span>
                    <select
                      className={fieldClass}
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

                <div className="mt-[0.25rem] flex flex-wrap items-center gap-[0.45rem]">
                  <HisuiButton
                    variant="ghost"
                    size="sm"
                    className="mt-[0.25rem]"
                    loading={Boolean(isPreviewLoading)}
                    loadingText="Loading..."
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
                    className="mt-[0.25rem]"
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
