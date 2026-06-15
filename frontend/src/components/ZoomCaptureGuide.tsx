interface Props {
  zoomLink: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ZoomCaptureGuide({ zoomLink, onConfirm, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Захват звука из Zoom</h2>
          <p className="text-sm text-slate-500 mt-0.5">Выполните 3 шага</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Step 1 */}
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              1
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">
                Откройте Zoom-встречу в браузере
              </p>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">
                Zoom должен быть открыт именно как вкладка Chrome — не в десктоп-приложении
              </p>
              {zoomLink ? (
                <a
                  href={zoomLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600 transition"
                >
                  Открыть встречу в браузере →
                </a>
              ) : (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                  Ссылка на встречу не указана. Откройте Zoom вручную в браузере.
                </p>
              )}
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              2
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">
                Нажмите «Далее» — появится диалог выбора
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Chrome покажет окно с вкладками. Перейдите на вкладку{" "}
                <strong>«Вкладка»</strong> и выберите вкладку с Zoom.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              3
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">
                Включите «Поделиться звуком вкладки»
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Внизу диалога есть галочка — обязательно включите её, иначе
                звук не будет захвачен.
              </p>
              <div className="mt-2 bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500 border border-slate-200">
                ☑ Поделиться звуком вкладки
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm hover:bg-slate-50 transition"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-indigo-600 transition"
          >
            Далее — выбрать вкладку
          </button>
        </div>
      </div>
    </div>
  );
}
