/**
 * 用系统保存对话框让用户选择保存位置和文件名。
 * 支持的浏览器（Chrome/Edge）弹出"另存为"对话框；
 * 不支持的浏览器（Safari 等）降级为传统下载。
 *
 * @param blob - 要保存的文件内容
 * @param suggestedName - 建议的文件名（含扩展名）
 * @param mime - MIME 类型，如 "application/zip"
 * @returns "saved" 用户已保存 | "cancelled" 用户取消 | "fallback" 已降级为传统下载
 */
export async function saveBlobWithPicker(
  blob: Blob,
  suggestedName: string,
  mime: string,
): Promise<"saved" | "cancelled" | "fallback"> {
  const anyWindow = window as unknown as {
    showSaveFilePicker?: (options: unknown) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (anyWindow.showSaveFilePicker) {
    try {
      const ext = suggestedName.split(".").pop() || "zip";
      const handle = await anyWindow.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "文件",
            accept: { [mime]: [`.${ext}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // 其他错误降级到传统下载
    }
  }

  // 降级：传统 a 标签下载
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "fallback";
}
