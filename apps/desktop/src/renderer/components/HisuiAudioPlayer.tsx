import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

interface HisuiAudioPlayerProps {
  src: string;
  autoPlay?: boolean;
  onError?: () => void;
  onPlayError?: () => void;
}

type PlayState = "idle" | "loading" | "playing" | "paused";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function HisuiAudioPlayer({ src, autoPlay = true, onError, onPlayError }: HisuiAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressTrackRef = useRef<HTMLDivElement | null>(null);
  const volumeTrackRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number>(0);
  const seekingRef = useRef(false);

  const [playState, setPlayState] = useState<PlayState>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [buffered, setBuffered] = useState(0);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;
  const effectiveVolume = isMuted ? 0 : volume;

  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || seekingRef.current) return;

    setCurrentTime(audio.currentTime);
    if (audio.buffered.length > 0) {
      setBuffered(audio.buffered.end(audio.buffered.length - 1));
    }

    if (!audio.paused && !audio.ended) {
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = volume;
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setPlayState("paused");
      if (autoPlay) {
        audio.play().catch(() => {
          setPlayState("paused");
          onPlayError?.();
        });
      }
    };

    const handlePlay = () => {
      setPlayState("playing");
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    };

    const handlePause = () => {
      setPlayState("paused");
      cancelAnimationFrame(animationFrameRef.current);
    };

    const handleEnded = () => {
      setPlayState("paused");
      setCurrentTime(audio.duration);
      cancelAnimationFrame(animationFrameRef.current);
    };

    const handleError = () => {
      setPlayState("idle");
      onError?.();
    };

    const handleWaiting = () => setPlayState("loading");
    const handleCanPlay = () => {
      if (!audio.paused) setPlayState("playing");
      else setPlayState("paused");
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.pause();
      audio.src = "";
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    setPlayState("loading");
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    audio.src = src;
    audio.load();
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = effectiveVolume;
  }, [effectiveVolume]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused || audio.ended) {
      audio.play().catch(() => onPlayError?.());
    } else {
      audio.pause();
    }
  }, [onPlayError]);

  const handleProgressSeek = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const track = progressTrackRef.current;
    if (!audio || !track || !Number.isFinite(audio.duration)) return;

    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
  }, []);

  const handleProgressMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    seekingRef.current = true;
    handleProgressSeek(event);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const audio = audioRef.current;
      const track = progressTrackRef.current;
      if (!audio || !track || !Number.isFinite(audio.duration)) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * audio.duration;
      setCurrentTime(audio.currentTime);
    };

    const handleMouseUp = () => {
      seekingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [handleProgressSeek]);

  const handleVolumeChange = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const track = volumeTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setVolume(ratio);
    if (ratio > 0 && isMuted) setIsMuted(false);
  }, [isMuted]);

  const handleVolumeMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    handleVolumeChange(event);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const track = volumeTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      setVolume(ratio);
      if (ratio > 0 && isMuted) setIsMuted(false);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [handleVolumeChange, isMuted]);

  const skipBack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - 10);
    setCurrentTime(audio.currentTime);
  }, []);

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 30);
    setCurrentTime(audio.currentTime);
  }, []);

  return (
    <div className="flex items-center gap-[0.65rem] rounded-[10px] border border-ui-border bg-ui-player-surface px-3 py-[0.6rem] shadow-ui-player-base transition-[border-color,box-shadow] duration-200 hover:border-ui-accent-ghost-border hover:shadow-ui-player-hover">
      <div className="flex shrink-0 items-center gap-[0.15rem]">
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-full border-0 bg-transparent p-0 text-ui-text-muted transition-[color,background,transform] duration-150 hover:bg-ui-frost-hover hover:text-ui-text-primary active:scale-[0.92]"
          onClick={skipBack}
          aria-label="Skip back 10 seconds"
          title="-10s"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12.5 8.14v7.72" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M9.5 12l3-3.86v7.72L9.5 12z" fill="currentColor"/>
            <path d="M4 12a8 8 0 1 1 8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <text x="15" y="14" fontSize="7" fill="currentColor" fontFamily="sans-serif" fontWeight="700">10</text>
          </svg>
        </button>

        <button
          type="button"
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full border-0 p-0 text-white transition-[background,box-shadow,transform] duration-150 active:scale-[0.92]",
            "bg-ui-accent shadow-ui-player-primary",
            "hover:bg-ui-accent-hover hover:shadow-ui-player-primary-hover",
            playState === "loading" && "opacity-80"
          )}
          onClick={togglePlayPause}
          aria-label={playState === "playing" ? "Pause" : "Play"}
        >
          {playState === "loading" ? (
            <svg className="animate-[spin_800ms_linear_infinite]" width="20" height="20" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
              <path d="M10 2a8 8 0 0 1 8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          ) : playState === "playing" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z"/>
            </svg>
          )}
        </button>

        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-full border-0 bg-transparent p-0 text-ui-text-muted transition-[color,background,transform] duration-150 hover:bg-ui-frost-hover hover:text-ui-text-primary active:scale-[0.92]"
          onClick={skipForward}
          aria-label="Skip forward 30 seconds"
          title="+30s"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M11.5 8.14v7.72" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M14.5 12l-3-3.86v7.72l3-3.86z" fill="currentColor"/>
            <path d="M20 12a8 8 0 1 0-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <text x="3" y="14" fontSize="7" fill="currentColor" fontFamily="sans-serif" fontWeight="700">30</text>
          </svg>
        </button>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-[0.45rem]">
        <span className="min-w-[3.2em] shrink-0 select-none text-center font-geist-mono text-[0.68rem] tracking-[0.02em] text-ui-text-secondary">{formatTime(currentTime)}</span>
        <div
          ref={progressTrackRef}
          className="group/progress relative h-[6px] flex-1 cursor-pointer rounded-full bg-ui-frost-track"
          role="slider"
          aria-label="Seek"
          aria-valuenow={Math.round(currentTime)}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          onMouseDown={handleProgressMouseDown}
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] rounded-[inherit] bg-ui-accent-buffered" style={{ width: `${bufferedPercent}%` }}/>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-[2] rounded-[inherit] bg-ui-player-fill" style={{ width: `${progressPercent}%` }}/>
          <div
            className="pointer-events-none absolute top-1/2 z-[3] h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ui-accent-hover shadow-ui-player-progress-thumb transition-transform duration-150 group-active/progress:scale-120"
            style={{ left: `${progressPercent}%` }}
          />
        </div>
        <span className="min-w-[3.2em] shrink-0 select-none text-center font-geist-mono text-[0.68rem] tracking-[0.02em] text-ui-text-secondary">{formatTime(duration)}</span>
      </div>

      <div className="flex shrink-0 items-center gap-[0.3rem]">
        <button
          type="button"
          className="grid h-[26px] w-[26px] place-items-center rounded-full border-0 bg-transparent p-0 text-ui-text-muted transition-[color,background,transform] duration-150 hover:text-ui-text-primary active:scale-[0.92]"
          onClick={() => setIsMuted(!isMuted)}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted || volume === 0 ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" opacity="0.6"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          ) : volume < 0.5 ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" opacity="0.6"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" opacity="0.6"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}
        </button>
        <div
          ref={volumeTrackRef}
          className="relative h-1 w-16 cursor-pointer rounded-full bg-ui-frost-track-strong"
          role="slider"
          aria-label="Volume"
          aria-valuenow={Math.round(effectiveVolume * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          onMouseDown={handleVolumeMouseDown}
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] rounded-[inherit] bg-ui-accent" style={{ width: `${effectiveVolume * 100}%` }}/>
          <div className="pointer-events-none absolute top-1/2 z-[2] h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ui-accent-hover shadow-ui-player-volume-thumb" style={{ left: `${effectiveVolume * 100}%` }}/>
        </div>
      </div>
    </div>
  );
}
