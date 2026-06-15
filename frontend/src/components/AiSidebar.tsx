import { renderMarkdown } from "../utils/markdown";

interface Props {
  summaryHtml: string;
  isStreaming: boolean;
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

export default function AiSidebar({ summaryHtml, isStreaming }: Props) {
  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-indigo-50">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-indigo-700">AI Заметки</span>
          {isStreaming && (
            <span className="text-xs text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full animate-pulse">
              Генерирую...
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 min-h-0">
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
            <p className="text-slate-400 text-xs leading-relaxed">
              AI автоматически создаст краткое резюме через каждые 2 минуты
              после появления 5+ новых фрагментов
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
