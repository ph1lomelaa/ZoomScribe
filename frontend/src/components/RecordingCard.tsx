import { useEffect, useState } from "react";
import { hasDeepgramKey } from "../hooks/useDeepgramTranscription";

interface Props {
  isCapturing: boolean;
  isConnected: boolean;
  captureSource: "system" | "mic" | null;
  segmentCount: number;
  audioLevel: number;
  audioStatus: string;
  onStartCapture: () => void;
  onStartMic: (deviceId?: string) => void;
  onStop: () => void;
  error: string;
  /** True right after the tab/app came back from being backgrounded while
   * capturing — mobile OSes can suspend mic/tab-audio capture in the
   * background, so this prompts the user to verify recording continued. */
  returnedFromBackground?: boolean;
}

function isZoomDevice(label: string) {
  const l = label.toLowerCase();
  return l.includes("zoom") || l.includes("zoomaudio");
}

export default function RecordingCard({
  isCapturing,
  isConnected,
  captureSource,
  segmentCount,
  audioLevel,
  audioStatus,
  onStartCapture,
  onStartMic,
  onStop,
  error,
  returnedFromBackground,
}: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [showMicOptions, setShowMicOptions] = useState(false);

  const loadDevices = () => {
    navigator.mediaDevices.enumerateDevices().then((all) => {
      const audio = all.filter((d) => d.kind === "audioinput");
      setDevices(audio);
      const zoom = audio.find((d) => isZoomDevice(d.label));
      if (zoom) setSelectedId((prev) => (prev === "" ? zoom.deviceId : prev));
    });
  };

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
  }, []);

  const sourceLabel =
    captureSource === "system" ? "вкладка / экран" : "микрофон";
  const audioPercent = Math.min(100, Math.round(audioLevel * 500));

  return (
    <div className="flex flex-col h-full bg-white border border-[#deddd8] rounded-lg overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-7 text-center overflow-y-auto">

        {/* Indicator */}
        <div className="relative mb-5">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-colors duration-300 ${
            isCapturing ? "bg-red-50 border-2 border-red-200" : "bg-slate-50 border-2 border-slate-200"
          }`}>
            {isCapturing ? (
              <>
                <span className="absolute inset-0 rounded-full bg-red-100 animate-ping opacity-40" />
                <span className="w-8 h-8 rounded-full bg-red-500" />
              </>
            ) : (
              <span className="w-8 h-8 rounded-full bg-slate-300" />
            )}
          </div>
        </div>

        {/* Status */}
        {isCapturing ? (
          <>
            <p className="text-lg font-semibold text-slate-800 mb-1">
              {isConnected ? "Идёт запись" : "Подключение..."}
            </p>
            <p className="text-sm text-slate-600 mb-5">
              {isConnected
                ? `${sourceLabel} · ${segmentCount} фрагм. сохранено`
                : "Соединяемся с сервером распознавания..."}
            </p>

            {/* Proactive, always-visible reminder while recording — mobile
                browsers can suspend audio capture once the tab/app is
                backgrounded, so this warns the user upfront rather than
                only after the fact. */}
            <div className="w-full max-w-xs mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-left">
              <p className="text-xs text-amber-700 leading-relaxed">
                Не блокируйте экран и не закрывайте вкладку — на телефоне запись звука может прерваться в фоне.
              </p>
            </div>

            {returnedFromBackground && (
              <div className="w-full max-w-xs mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-left">
                <p className="text-xs text-red-600 leading-relaxed">
                  Вкладка была свёрнута. Проверьте индикатор записи ниже — если звук не идёт, начните захват заново.
                </p>
              </div>
            )}

            {isConnected && (
              <div className="w-full max-w-xs mb-5 text-left">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-600">Входящий звук</span>
                  <span className="text-xs font-mono text-slate-600">{audioPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      audioPercent > 2 ? "bg-emerald-400" : "bg-amber-300"
                    }`}
                    style={{ width: `${Math.max(audioPercent, isCapturing ? 2 : 0)}%` }}
                  />
                </div>
                {audioPercent <= 2 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Сигнал почти нулевой: проверьте, что выбрана именно вкладка Zoom и включён звук вкладки.
                  </p>
                )}
                {audioStatus && (
                  <p className="text-xs text-slate-600 mt-1 font-mono">
                    {audioStatus}
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-slate-800 mb-1">Запись не ведётся</p>
            <p className="text-sm text-slate-600 mb-5">
              {segmentCount > 0
                ? `${segmentCount} фрагментов сохранено`
                : "Нажмите кнопку ниже чтобы начать"}
            </p>
          </>
        )}

        <div className="flex flex-col items-center gap-3 w-full max-w-xs">

          {isCapturing ? (
            <button
              onClick={onStop}
              className="w-full py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition text-sm"
            >
              Остановить запись
            </button>
          ) : (
            <>
              {/* Primary: tab/screen capture — no mic conflict */}
              {hasDeepgramKey && (
                <>
                  <button
                    onClick={onStartCapture}
                    className="w-full py-3 rounded-full bg-[#242426] text-white font-medium hover:bg-black transition text-sm"
                  >
                    Выбрать вкладку Zoom / Teams
                  </button>
                  <p className="text-xs text-slate-600 leading-relaxed text-center -mt-1">
                    Chrome покажет список вкладок — выберите нужную и включите
                    «Поделиться звуком вкладки»
                  </p>
                </>
              )}

              {/* Secondary: mic */}
              <button
                onClick={() => setShowMicOptions((v) => !v)}
                className="w-full min-h-11 inline-flex items-center justify-center rounded-full border border-[#d9d7d1] text-[#6e6c66] text-xs hover:bg-[#f2f0eb] transition"
              >
                {showMicOptions ? "Скрыть настройки" : "Использовать микрофон"}
              </button>

              {showMicOptions && (
                <div className="w-full flex flex-col gap-2">
                  {hasDeepgramKey && devices.length > 1 && (
                    <select
                      value={selectedId}
                      onChange={(e) => setSelectedId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-700"
                    >
                      <option value="">Микрофон по умолчанию</option>
                      {devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {isZoomDevice(d.label)
                            ? `Zoom — ${d.label}`
                            : d.label || `Устройство ${d.deviceId.slice(0, 6)}`}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => onStartMic(selectedId || undefined)}
                    className="w-full min-h-11 inline-flex items-center justify-center rounded-full bg-[#242426] text-white text-sm font-medium hover:bg-black transition"
                  >
                    Начать запись с микрофона
                  </button>
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-left leading-relaxed">
                    Микрофон может конфликтовать с Zoom/Teams. Рекомендуем вариант выше.
                  </p>
                </div>
              )}
            </>
          )}

          <p className="text-xs text-slate-600 leading-relaxed">
            Распознавание: русский, английский и смешанная речь автоматически
          </p>

          {/* Errors */}
          {error === "__SAFARI__" && (
            <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
              <p className="text-sm font-semibold text-amber-800 mb-1">Safari не поддерживает захват вкладки</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Открой ZoomScribe в <strong>Chrome</strong> — только Chrome умеет захватывать
                звук вкладки. Или используй микрофон (кнопка ниже).
              </p>
            </div>
          )}
          {error === "__NO_AUDIO__" && (
            <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
              <p className="text-sm font-semibold text-amber-800 mb-1">Звук не захвачен</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                При выборе вкладки нужно поставить галочку{" "}
                <strong>«Поделиться звуком вкладки»</strong> внизу диалога Chrome.
                Нажми кнопку ещё раз и не забудь галочку.
              </p>
            </div>
          )}
          {error === "__MIC_BUSY__" && (
            <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
              <p className="text-sm font-semibold text-amber-800 mb-1">Микрофон занят Zoom</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Используй кнопку «Выбрать вкладку Zoom / Teams» — она не требует микрофон.
              </p>
            </div>
          )}
          {error && error !== "__MIC_BUSY__" && error !== "__NO_AUDIO__" && (
            <div className="w-full px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
