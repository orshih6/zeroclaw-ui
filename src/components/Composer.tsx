import { ArrowUp, LoaderCircle, Plus, Square, X } from "lucide-react";
import { type ClipboardEvent, type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { fileName } from "../lib/format";

export type Attachment = { marker: string; path: string; preview: string; name: string };

type Props = {
  agent: string;
  disabled: boolean;
  disabledReason?: string;
  busy: boolean;
  allowImages: boolean;
  autoFocus?: boolean;
  /** Controls shown at the bottom left, next to the attach button (the model menu). */
  tools?: ReactNode;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
};

export function Composer({
  agent,
  disabled,
  disabledReason,
  busy,
  allowImages,
  autoFocus,
  tools,
  onSend,
  onStop,
}: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) area.current?.focus();
  }, [autoFocus]);

  // Grow with the text, up to a point.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  async function addFiles(list: FileList | File[]) {
    setError(null);
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} is not an image. Only images can be attached.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const up = await api.upload(agent, file);
        setFiles((f) => [
          ...f,
          {
            marker: up.marker,
            path: up.path,
            preview: URL.createObjectURL(file),
            name: file.name || fileName(up.path),
          },
        ]);
      } catch (e) {
        setError(`Could not upload ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const canSend = !disabled && !busy && uploading === 0 && (text.trim() !== "" || files.length > 0);

  function submit() {
    if (!canSend) return;
    onSend(text.trim(), files);
    setText("");
    setFiles([]);
    setError(null);
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!allowImages) return;
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      e.preventDefault();
      addFiles(images);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(false);
    if (allowImages) addFiles(e.dataTransfer.files);
  }

  return (
    <div>
      {error && (
        <p className="mb-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div
        onDragOver={(e) => {
          if (allowImages && e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-[1.6rem] border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_24px_-6px_rgba(0,0,0,0.08)] transition-colors ${
          dragging ? "border-accent" : "border-line focus-within:border-line-strong"
        }`}
      >
        {(files.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {files.map((f) => (
              <div key={f.path} className="relative">
                <img
                  src={f.preview}
                  alt={f.name}
                  className="h-16 w-16 rounded-xl border border-line object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((all) => all.filter((x) => x.path !== f.path))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-bg"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {uploading > 0 && (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-line-strong">
                <LoaderCircle size={18} className="animate-spin text-ink-3" />
              </div>
            )}
          </div>
        )}
        <textarea
          ref={area}
          value={text}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? (disabledReason ?? "Not available") : "How can I help?"}
          aria-label="Message"
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            // On a phone Enter makes a new line; the button sends.
            if (matchMedia("(pointer: coarse)").matches) return;
            e.preventDefault();
            submit();
          }}
          className="scroll-thin block w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[16px] leading-relaxed outline-none placeholder:text-ink-3 focus-visible:outline-none disabled:opacity-60"
        />
        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          {allowImages && (
            <>
              <input
                ref={picker}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                title="Attach images"
                aria-label="Attach images"
                disabled={disabled}
                onClick={() => picker.current?.click()}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-2 hover:bg-panel hover:text-ink disabled:opacity-40"
              >
                <Plus size={18} />
              </button>
            </>
          )}
          {tools}
          <div className="ml-auto">
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                title="Stop"
                aria-label="Stop the answer"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-bg hover:opacity-85"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                title="Send"
                aria-label="Send message"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-25"
              >
                <ArrowUp size={18} strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
