import { useEffect, useRef, useState } from "react";
import {
  Radio,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  FileText,
  Loader2,
  Check,
  User,
  Sparkles,
  Headphones,
} from "lucide-react";
import { useApp } from "../context/AppContext.jsx";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function PodcastModal({ isOpen, onClose, podcastData, isGenerating }) {
  const { sources, handlePodcast } = useApp();

  const [length, setLength] = useState("medium");
  const [selectedSourceIds, setSelectedSourceIds] = useState([]);
  const [useAllSources, setUseAllSources] = useState(true);

  // Audio Player State
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (sources.length > 0 && selectedSourceIds.length === 0) {
      setSelectedSourceIds(sources.map((s) => s.id));
    }
  }, [sources]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [podcastData]);

  if (!isOpen) return null;

  function toggleSourceSelection(sourceId) {
    setSelectedSourceIds((prev) =>
      prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId]
    );
  }

  function handleStartGeneration() {
    const ids = useAllSources ? null : selectedSourceIds;
    handlePodcast(length, ids);
  }

  // Audio Handlers
  function togglePlayPause() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }

  function handleTimeUpdate() {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }

  function handleLoadedMetadata() {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  }

  function handleSeek(e) {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }

  function handleSpeedChange(rate) {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }

  function toggleMute() {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }

  function formatTime(secs) {
    if (isNaN(secs) || secs < 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function handleDownloadAudio() {
    if (!podcastData?.audio_url) return;
    const url = podcastData.audio_url.startsWith("http")
      ? podcastData.audio_url
      : `${API_BASE_URL}${podcastData.audio_url}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${podcastData.podcast_id || "sourcemind_podcast"}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleDownloadTranscript() {
    if (!podcastData?.transcript) return;
    const blob = new Blob([podcastData.transcript], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${podcastData.podcast_id || "sourcemind_podcast"}_transcript.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const audioSrc = podcastData?.audio_url
    ? podcastData.audio_url.startsWith("http")
      ? podcastData.audio_url
      : `${API_BASE_URL}${podcastData.audio_url}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 animate-fade-in backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-[95vw] sm:w-full max-w-2xl flex flex-col animate-scale-in overflow-hidden rounded-2xl border border-line dark:border-dline bg-panel dark:bg-dpanel shadow-floating"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line dark:border-dline px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <span className="flex h-8 sm:h-9 w-8 sm:w-9 items-center justify-center rounded-xl bg-podcast-soft text-podcast dark:bg-podcast/20 shrink-0">
              <Radio size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-sm sm:text-base font-semibold truncate">Podcast Agent</h3>
              <p className="text-[11px] sm:text-xs text-subink dark:text-dsubink truncate">
                Source-grounded 2-speaker dialogue (Host & Expert)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !px-2 !py-1.5 shrink-0" title="Close">
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
          {/* Section 1: Generation Settings Form */}
          {!isGenerating && !podcastData && (
            <div className="space-y-5">
              {/* Length Selection */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-subink dark:text-dsubink">
                  Select Duration / Length
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  {[
                    { id: "short", label: "Short", time: "~1-2 mins", desc: "Key highlights" },
                    { id: "medium", label: "Medium", time: "~3-5 mins", desc: "Balanced discussion" },
                    { id: "detailed", label: "Detailed", time: "~6-10 mins", desc: "Deep dive" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setLength(item.id)}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                        length === item.id
                          ? "border-podcast bg-podcast-soft/50 dark:bg-podcast/20 ring-2 ring-podcast"
                          : "border-line dark:border-dline hover:bg-canvas dark:hover:bg-dline/30"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-bold text-ink dark:text-dink">{item.label}</span>
                        <span className="text-[11px] font-medium text-podcast">{item.time}</span>
                      </div>
                      <span className="mt-1 text-[10px] text-subink dark:text-dsubink">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>


              {/* Source Selection */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-subink dark:text-dsubink">
                  Select Sources
                </label>
                <div className="flex items-center gap-4 mb-3">
                  <label className="flex items-center gap-2 text-xs cursor-pointer font-medium">
                    <input
                      type="radio"
                      name="source_mode"
                      checked={useAllSources}
                      onChange={() => setUseAllSources(true)}
                      className="accent-podcast"
                    />
                    All Sources ({sources.length})
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer font-medium">
                    <input
                      type="radio"
                      name="source_mode"
                      checked={!useAllSources}
                      onChange={() => setUseAllSources(false)}
                      className="accent-podcast"
                    />
                    Selected Sources Only
                  </label>
                </div>

                {!useAllSources && (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-xl border border-line dark:border-dline p-3 bg-canvas/40 dark:bg-dpanel2/40">
                    {sources.length === 0 ? (
                      <p className="text-xs text-subink dark:text-dsubink">No sources uploaded yet.</p>
                    ) : (
                      sources.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-canvas dark:hover:bg-dline/30 cursor-pointer"
                        >
                          <span className="truncate font-medium text-ink dark:text-dink">{s.name}</span>
                          <input
                            type="checkbox"
                            checked={selectedSourceIds.includes(s.id)}
                            onChange={() => toggleSourceSelection(s.id)}
                            className="accent-podcast"
                          />
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleStartGeneration}
                disabled={sources.length === 0 || (!useAllSources && selectedSourceIds.length === 0)}
                className="btn-primary w-full !py-3 !text-sm !bg-podcast hover:!bg-podcast/90 flex items-center justify-center gap-2"
              >
                <Headphones size={16} /> Generate 2-Speaker Podcast
              </button>
            </div>
          )}

          {/* Section 2: Loading State */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-podcast-soft text-podcast dark:bg-podcast/20">
                <Loader2 size={28} className="animate-spin text-podcast" />
              </div>
              <div>
                <h4 className="font-display text-base font-semibold">Podcast Agent is working...</h4>
                <p className="mt-1 text-xs text-subink dark:text-dsubink">
                  Drafting Host & Expert dialogue and synthesizing natural neural voices.
                </p>
              </div>
              <p className="text-[11px] text-podcast animate-pulse font-mono">
                Watch the Agent Workflow panel on the right for live updates
              </p>
            </div>
          )}

          {/* Section 3: Generated Podcast View */}
          {!isGenerating && podcastData && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex items-center justify-between rounded-xl border border-line dark:border-dline p-4 bg-canvas/40 dark:bg-dpanel2/40">
                <div>
                  <h4 className="font-display text-sm font-semibold text-ink dark:text-dink">
                    {podcastData.title || "SourceMind Podcast"}
                  </h4>
                  <p className="text-xs text-subink dark:text-dsubink capitalize">
                    {podcastData.length} length · 2 Speakers (Ava Host & Christopher Expert)
                  </p>
                </div>
                <button
                  onClick={handleStartGeneration}
                  className="btn-secondary !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
                >
                  <Sparkles size={13} className="text-podcast" /> Regenerate
                </button>
              </div>

              {/* Audio Player Card */}
              {audioSrc && (
                <div className="rounded-2xl border border-line dark:border-dline bg-panel dark:bg-dpanel p-4 shadow-sm space-y-3">
                  <audio
                    ref={audioRef}
                    src={audioSrc}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => setIsPlaying(false)}
                  />

                  {/* Top Control Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1">
                      <button
                        onClick={togglePlayPause}
                        className="flex h-10 sm:h-11 w-10 sm:w-11 shrink-0 items-center justify-center rounded-full bg-podcast text-white hover:bg-podcast/90 transition-all shadow-md"
                      >
                        {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                      </button>

                      {/* Progress Bar & Timers */}
                      <div className="flex-1 space-y-1">
                        <input
                          type="range"
                          min={0}
                          max={duration || 100}
                          value={currentTime}
                          onChange={handleSeek}
                          className="w-full accent-podcast cursor-pointer h-1.5 rounded-lg bg-line dark:bg-dline"
                        />
                        <div className="flex justify-between text-[11px] font-mono text-subink dark:text-dsubink">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Speed Selector & Mute */}
                    <div className="flex items-center justify-between sm:justify-end gap-1 shrink-0 pt-1 sm:pt-0 border-t border-line/40 dark:border-dline/40 sm:border-0">
                      <div className="flex items-center gap-1">
                        {[1, 1.25, 1.5, 2].map((rate) => (
                          <button
                            key={rate}
                            onClick={() => handleSpeedChange(rate)}
                            className={`rounded px-1.5 py-1 text-[10px] font-mono font-medium transition-colors ${
                              playbackRate === rate
                                ? "bg-podcast text-white"
                                : "bg-canvas dark:bg-dline/40 text-subink hover:text-ink"
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                      <button onClick={toggleMute} className="btn-ghost !p-1.5" title="Mute">
                        {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                      </button>
                    </div>
                  </div>


                  {/* Actions: Download Audio */}
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleDownloadAudio}
                      className="btn-secondary !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
                    >
                      <Download size={13} /> Download Audio (.mp3)
                    </button>
                  </div>
                </div>
              )}

              {/* 2-Speaker Transcript View */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-subink dark:text-dsubink">
                    2-Speaker Podcast Transcript
                  </h4>
                  <button
                    onClick={handleDownloadTranscript}
                    className="btn-ghost !py-1 !px-2 !text-xs flex items-center gap-1 text-subink hover:text-ink"
                  >
                    <FileText size={12} /> Download Transcript (.md)
                  </button>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {(podcastData.dialogue || []).map((turn, idx) => {
                    const isHost = turn.speaker === "Host";
                    return (
                      <div
                        key={idx}
                        className={`flex gap-3 text-xs leading-relaxed rounded-xl p-3 border ${
                          isHost
                            ? "border-podcast/20 bg-podcast-soft/40 dark:bg-podcast/10"
                            : "border-line dark:border-dline bg-canvas/50 dark:bg-dpanel2/40"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            isHost
                              ? "bg-podcast text-white"
                              : "bg-ink text-white dark:bg-dink dark:text-dcanvas"
                          }`}
                        >
                          {isHost ? "H" : "E"}
                        </span>
                        <div className="flex-1">
                          <p className={`font-semibold mb-0.5 ${isHost ? "text-podcast" : "text-ink dark:text-dink"}`}>
                            {turn.speaker}
                          </p>
                          <p className="text-ink dark:text-dink whitespace-pre-wrap">{turn.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
