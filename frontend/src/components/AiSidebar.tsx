import { renderMarkdown } from "../utils/markdown";

interface Props {
  summaryHtml: string;
  isStreaming: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 bg-indigo-400 rounded-full animate-thinking-dot"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

function StreamingPill() {
  return (
    <span className="text-xs text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full animate-pulse">
      Генерирую...
    </span>
  );
}

// On <lg screens this renders as a fixed bottom sheet (collapsed to a 56px
// handle bar, expands to 70vh on tap) instead of a third stacked full-height
// column — reviewing the AI summary during a live call shouldn't require
// scrolling past it to get back to the recording controls. lg+ keeps the
// original static sidebar/column behavior unchanged.
export default function AiSidebar({ summaryHtml, isStreaming, isOpen, onToggleOpen }: Props) {
  return (
    <div
      className={`flex flex-col bg-white border border-[#deddd8] overflow-hidden
        fixed inset-x-0 bottom-0 z-30 rounded-t-2xl shadow-[0_-8px_30px_rgba(32,32,35,.14)] transition-[height] duration-300
        ${isOpen ? "h-[70vh]" : "h-14"}
        lg:static lg:inset-auto lg:z-auto lg:h-full lg:rounded-lg lg:shadow-none lg:transition-none`}
    >
      {/* Mobile/tablet: header doubles as the sheet's open/close handle */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Свернуть итоги созвона" : "Развернуть итоги созвона"}
        className="lg:hidden w-full min-h-[44px] flex items-center justify-between gap-2 px-4 py-3 border-b border-[#eceae5] bg-[#faf9f6]"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-[#6147a7] shrink-0">Итоги созвона</span>
          {isStreaming && <StreamingPill />}
        </span>
        <span className={`shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">
          ⌃
        </span>
      </button>

      {/* Desktop/tablet-landscape: original static header, unchanged */}
      <div className="hidden lg:block px-4 py-3 border-b border-[#eceae5] bg-[#faf9f6]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[#6147a7]">Итоги созвона</span>
          {isStreaming && <StreamingPill />}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-4 min-h-0 ${isOpen ? "block" : "hidden"} lg:block`}>
        {isStreaming && !summaryHtml && <ThinkingDots />}
        {summaryHtml ? (
          <div
            className="prose-custom text-sm"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(summaryHtml),
            }}
          />
        ) : !isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <p className="text-slate-600 text-xs leading-relaxed">
              AI автоматически создаст краткое резюме через каждые 2 минуты
              после появления 5+ новых фрагментов
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
