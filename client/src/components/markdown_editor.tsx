import Editor from '@monaco-editor/react';
import { editor, KeyMod, KeyCode, Range, Position } from 'monaco-editor'; // 添加 Range 和 Position 导入
import React, { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Loading from 'react-loading';
import { useColorMode } from "../utils/darkModeUtils";
import { Markdown } from "./markdown";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";

interface MarkdownEditorProps {
  content: string;
  setContent: (content: string) => void;
  placeholder?: string;
  height?: string;
}

export function MarkdownEditor({ content, setContent, placeholder = "> Write your content here...", height = "400px" }: MarkdownEditorProps) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const isComposingRef = useRef(false);
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [uploading, setUploading] = useState(false);

  function uploadImage(file: File, onSuccess: (url: string) => void, showAlert: (msg: string) => void) {
    client.storage.index
      .post(
        {
          key: file.name,
          file: file,
        },
        {
          headers: headersWithAuth(),
        }
      )
      .then(({ data, error }) => {
        if (error) {
          showAlert(t("upload.failed"));
        }
        if (data) {
          onSuccess(data);
        }
      })
      .catch((e: any) => {
        console.error(e);
        showAlert(t("upload.failed"));
      });
  }

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardData = event.clipboardData;
    if (clipboardData.files.length === 1) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.trigger(undefined, "undo", undefined);
      setUploading(true);
      const myfile = clipboardData.files[0] as File;
      uploadImage(myfile, (url) => {
        const selection = editor.getSelection();
        if (!selection) return;
        editor.executeEdits(undefined, [{
          range: selection,
          text: `![${myfile.name}](${url})\n`,
        }]);
        setUploading(false);
      }, (msg) => console.error(msg));
    }
  };

  function UploadImageButton() {
    const uploadRef = useRef<HTMLInputElement>(null);
    
    const upChange = (event: any) => {
      for (let i = 0; i < event.currentTarget.files.length; i++) {
        const file = event.currentTarget.files[i];
        if (file.size > 5 * 1024000) {
          alert("File too large (max 5MB)");
          uploadRef.current!.value = "";
        } else {
          const editor = editorRef.current;
          if (!editor) return;
          const selection = editor.getSelection();
          if (!selection) return;
          setUploading(true);
          uploadImage(file, (url) => {
            setUploading(false);
            editor.executeEdits(undefined, [{
              range: selection,
              text: `![${file.name}](${url})\n`,
            }]);
          }, (msg) => console.error(msg));
        }
      }
    };
    
    return (
      <button onClick={() => uploadRef.current?.click()}>
        <input
          ref={uploadRef}
          onChange={upChange}
          className="hidden"
          type="file"
          accept="image/gif,image/jpeg,image/jpg,image/png"
        />
        <i className="ri-image-add-line" />
      </button>
    );
  }

  function ToolbarButtons() {
    const handleInsert = (text: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const selection = editor.getSelection();
      if (!selection) return;
      editor.executeEdits(undefined, [{
        range: selection,
        text: text,
      }]);
    };  

    return (
      <>
        {/* 现有 UploadImageButton */}
        <UploadImageButton />
        {/* 新增：加粗 */}
        <button onClick={() => handleInsert('****')} title={t('bold')}>
          <i className="ri-bold" />
        </button>
        {/* 新增：斜体 */}
        <button onClick={() => handleInsert('**')} title={t('italic')}>
          <i className="ri-italic" />
        </button>
        {/* 新增：链接 */}
        <button onClick={() => handleInsert('[](url)')} title={t('link')}>
          <i className="ri-link" />
        </button>
        {/* 新增：代码块 */}
        <button onClick={() => handleInsert('```\ncode\n```')} title={t('code')}>
          <i className="ri-code-box-line" />
        </button>
      </>
    );
  }  

  /* ---------------- Monaco Mount & IME Optimization ---------------- */

  const handleEditorMount = (editorInstance: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInstance;

    editorInstance.onDidCompositionStart(() => {
      isComposingRef.current = true;
    });

    editorInstance.onDidCompositionEnd(() => {
      isComposingRef.current = false;
      setContent(editorInstance.getValue());
    });

    editorInstance.onDidChangeModelContent(() => {
      if (!isComposingRef.current) {
        setContent(editorInstance.getValue());
      }
    });

    editorInstance.onDidBlurEditorText(() => {
      setContent(editorInstance.getValue());
    });

    // 使用导入的 KeyMod 和 KeyCode，而不是 monaco.KeyMod 和 monaco.KeyCode
    editorInstance.addAction({
      id: 'markdown-bold',
      label: 'Toggle Bold',
      keybindings: [
        KeyMod.CtrlCmd | KeyCode.KeyB
      ],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 1,
      run: () => {
        const selection = editorInstance.getSelection();
        if (!selection) return;
        const model = editorInstance.getModel();
        if (!model) return;
        
        const selectedText = model.getValueInRange(selection);
        // 如果已经加粗，则移除；否则添加加粗标记
        if (selectedText.startsWith('**') && selectedText.endsWith('**')) {
          const newText = selectedText.slice(2, -2);
          editorInstance.executeEdits('bold', [{
            range: selection,
            text: newText,
          }]);
        } else {
          editorInstance.executeEdits('bold', [{
            range: selection,
            text: `**${selectedText}**`,
          }]);
        }
      }
    });  

    // 2. 斜体文本: Ctrl/Cmd + I
    editorInstance.addAction({
      id: 'markdown-italic',
      label: 'Toggle Italic',
      keybindings: [
        KeyMod.CtrlCmd | KeyCode.KeyI
      ],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 2,
      run: () => {
        const selection = editorInstance.getSelection();
        if (!selection) return;
        const model = editorInstance.getModel();
        if (!model) return;
        
        const selectedText = model.getValueInRange(selection);
        if (selectedText.startsWith('*') && selectedText.endsWith('*') && selectedText.length > 1) {
          const newText = selectedText.slice(1, -1);
          editorInstance.executeEdits('italic', [{
            range: selection,
            text: newText,
          }]);
        } else {
          editorInstance.executeEdits('italic', [{
            range: selection,
            text: `*${selectedText}*`,
          }]);
        }
      }
    });  

    // 3. 插入链接: Ctrl/Cmd + K
    editorInstance.addAction({
      id: 'markdown-link',
      label: 'Insert Link',
      keybindings: [
        KeyMod.CtrlCmd | KeyCode.KeyK
      ],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 3,
      run: () => {
        const selection = editorInstance.getSelection();
        if (!selection) return;
        const model = editorInstance.getModel();
        if (!model) return;
        
        const selectedText = model.getValueInRange(selection);
        let newText;
        let newSelection;
        
        if (selectedText) {
          // 如果有选中文本，用其作为链接文本
          newText = `[${selectedText}](url)`;
          // 选中URL部分方便修改
          newSelection = new Range(  // 使用直接导入的 Range 类
            selection.startLineNumber,
            selection.startColumn + selectedText.length + 3,
            selection.endLineNumber,
            selection.startColumn + selectedText.length + 6
          );
        } else {
          // 如果没有选中文本，插入完整的链接模板
          newText = `[链接文本](url)`;
          // 选中"链接文本"部分
          newSelection = new Range(  // 使用直接导入的 Range 类
            selection.startLineNumber,
            selection.startColumn + 1,
            selection.startLineNumber,
            selection.startColumn + 5
          );
        }
        
        editorInstance.executeEdits('link', [{
          range: selection,
          text: newText,
        }]);
        
        // 设置新的选择区域，方便用户直接修改
        if (newSelection) {
          editorInstance.setSelection(newSelection);
          editorInstance.focus();
        }
      }
    });  

    // 4. 插入代码: Ctrl/Cmd + `
    editorInstance.addAction({
      id: 'markdown-inline-code',
      label: 'Insert Inline Code',
      keybindings: [
        KeyMod.CtrlCmd | KeyCode.Backquote
      ],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 4,
      run: () => {
        const selection = editorInstance.getSelection();
        if (!selection) return;
        const model = editorInstance.getModel();
        if (!model) return;
        
        const selectedText = model.getValueInRange(selection);
        if (selectedText.startsWith('`') && selectedText.endsWith('`') && selectedText.length > 1) {
          const newText = selectedText.slice(1, -1);
          editorInstance.executeEdits('inline-code', [{
            range: selection,
            text: newText,
          }]);
        } else {
          editorInstance.executeEdits('inline-code', [{
            range: selection,
            text: `\`${selectedText}\``,
          }]);
        }
      }
    });  

    // 5. 插入代码块: Ctrl/Cmd + Shift + `
    editorInstance.addAction({
      id: 'markdown-code-block',
      label: 'Insert Code Block',
      keybindings: [
        KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backquote
      ],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 5,
      run: () => {
        const selection = editorInstance.getSelection();
        if (!selection) return;
        
        const selectedText = editorInstance.getModel()?.getValueInRange(selection) || '';
        let newText;
        
        if (selectedText) {
          // 如果有选中文本，将其包裹在代码块中
          newText = `\`\`\`\n${selectedText}\n\`\`\``;
        } else {
          // 插入空的代码块，并将光标放在中间
          newText = `\`\`\`\nlanguage\n\`\`\``;
        }
        
        editorInstance.executeEdits('code-block', [{
          range: selection,
          text: newText,
        }]);
        
        // 如果没有选中文本，将光标放在"language"处
        if (!selectedText) {
          const newSelection = new Range(  // 使用直接导入的 Range 类
            selection.startLineNumber + 1,
            1,
            selection.startLineNumber + 1,
            9
          );
          editorInstance.setSelection(newSelection);
          editorInstance.focus();
        }
      }
    });  

    // 6. 插入引用块: Ctrl/Cmd + Shift + Q
    editorInstance.addAction({
      id: 'markdown-blockquote',
      label: 'Insert Blockquote',
      keybindings: [
        KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyQ
      ],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 6,
      run: () => {
        const selection = editorInstance.getSelection();
        if (!selection) return;
        const model = editorInstance.getModel();
        if (!model) return;
        
        const selectedText = model.getValueInRange(selection);
        let newText;
        
        if (selectedText) {
          // 为选中的每一行添加 > 前缀
          const lines = selectedText.split('\n');
          newText = lines.map(line => `> ${line}`).join('\n');
        } else {
          // 插入空的引用块
          newText = `> `;
        }
        
        editorInstance.executeEdits('blockquote', [{
          range: selection,
          text: newText,
        }]);
      }
    });  

    // 7. 插入无序列表: Ctrl/Cmd + Shift + L
    editorInstance.addAction({
      id: 'markdown-unordered-list',
      label: 'Insert Unordered List',
      keybindings: [
        KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL
      ],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 7,
      run: () => {
        const selection = editorInstance.getSelection();
        if (!selection) return;
        const model = editorInstance.getModel();
        if (!model) return;
        
        const selectedText = model.getValueInRange(selection);
        let newText;
        
        if (selectedText) {
          // 为选中的每一行添加 - 前缀
          const lines = selectedText.split('\n');
          newText = lines.map(line => `- ${line}`).join('\n');
        } else {
          // 插入无序列表项
          newText = `- `;
        }
        
        editorInstance.executeEdits('unordered-list', [{
          range: selection,
          text: newText,
        }]);
      }
    });  

    // 8. 插入有序列表: Ctrl/Cmd + Shift + O
    editorInstance.addAction({
      id: 'markdown-ordered-list',
      label: 'Insert Ordered List',
      keybindings: [
        KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO
      ],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 8,
      run: () => {
        const selection = editorInstance.getSelection();
        if (!selection) return;
        const model = editorInstance.getModel();
        if (!model) return;
        
        const selectedText = model.getValueInRange(selection);
        let newText;
        
        if (selectedText) {
          // 为选中的每一行添加 1. 2. 3. 前缀
          const lines = selectedText.split('\n');
          newText = lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
        } else {
          // 插入有序列表项
          newText = `1. `;
        }
        
        editorInstance.executeEdits('ordered-list', [{
          range: selection,
          text: newText,
        }]);
      }
    });  

    // 9. 插入标题 (多个级别): Ctrl/Cmd + 1/2/3/4/5/6
    const addHeadingAction = (level: number) => {
      editorInstance.addAction({
        id: `markdown-heading-${level}`,
        label: `Insert Heading ${level}`,
        keybindings: [
          KeyMod.CtrlCmd | KeyMod.Alt | (KeyCode.Digit0 + level) // 使用 KeyCode.Digit0 作为基准
        ],
        contextMenuGroupId: 'markdown',
        contextMenuOrder: 9 + level,
        run: () => {
          const selection = editorInstance.getSelection();
          if (!selection) return;
          const model = editorInstance.getModel();
          if (!model) return;
          
          const selectedText = model.getValueInRange(selection);
          const hashes = '#'.repeat(level);
          let newText;
          
          // 检查是否已经是标题
          const line = model.getLineContent(selection.startLineNumber);
          const headingRegex = /^(#{1,6})\s/;
          const match = line.match(headingRegex);
          
          if (match && match[1].length === level) {
            // 如果已经是相同级别的标题，则移除
            newText = line.replace(headingRegex, '');
          } else if (match) {
            // 如果是其他级别的标题，则替换级别
            newText = line.replace(headingRegex, `${hashes} `);
          } else if (selectedText) {
            // 如果有选中文本，将其转换为标题
            newText = `${hashes} ${selectedText}`;
          } else {
            // 插入空标题
            newText = `${hashes} `;
          }
          
          // 如果是整行替换
          if (!selectedText) {
            const lineRange = new Range(  // 使用直接导入的 Range 类
              selection.startLineNumber,
              1,
              selection.startLineNumber,
              model.getLineLength(selection.startLineNumber) + 1
            );
            editorInstance.executeEdits(`heading-${level}`, [{
              range: lineRange,
              text: newText,
            }]);
          } else {
            editorInstance.executeEdits(`heading-${level}`, [{
              range: selection,
              text: newText,
            }]);
          }
        }
      });
    };  

    // 注册6个级别的标题快捷键 (Ctrl/Cmd + Alt + 1~6)
    for (let level = 1; level <= 6; level++) {
      addHeadingAction(level);
    }  

    // 10. 插入水平分割线: Ctrl/Cmd + Shift + H
    editorInstance.addAction({
      id: 'markdown-horizontal-rule',
      label: 'Insert Horizontal Rule',
      keybindings: [
        KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH
      ],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 16,
      run: () => {
        const selection = editorInstance.getSelection();
        if (!selection) return;
        
        // 插入分割线，前后留空行是Markdown最佳实践
        const newText = `\n---\n`;
        
        editorInstance.executeEdits('horizontal-rule', [{
          range: selection,
          text: newText,
        }]);
        
        // 将光标放在分割线之后
        const newPosition = new Position(  // 使用直接导入的 Position 类
          selection.startLineNumber + 2,
          1
        );
        editorInstance.setPosition(newPosition);
        editorInstance.focus();
      }
    });
  };

  /* ---------------- synchronization ---------------- */

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const editorValue = model.getValue();

    // Avoid infinite loops & prevent overwriting content being edited
    if (editorValue !== content) {
      editor.setValue(content);
    }
  }, [content]);

  /* ---------------- UI ---------------- */

  return (
    <div className="flex flex-col mx-4 my-2 md:mx-0 md:my-0 gap-2">
      <div className="flex flex-row space-x-2">
        <button className={`${preview === 'edit' ? "text-theme" : ""}`} onClick={() => setPreview('edit')}> {t("edit")} </button>
        <button className={`${preview === 'preview' ? "text-theme" : ""}`} onClick={() => setPreview('preview')}> {t("preview")} </button>
        <button className={`${preview === 'comparison' ? "text-theme" : ""}`} onClick={() => setPreview('comparison')}> {t("comparison")} </button>
        <div className="flex-grow" />
        {uploading &&
          <div className="flex flex-row space-x-2 items-center">
            <Loading type="spin" color="#FC466B" height={16} width={16} />
            <span className="text-sm text-neutral-500">{t('uploading')}</span>
          </div>
        }
      </div>
      <div className={`grid grid-cols-1 ${preview === 'comparison' ? "sm:grid-cols-2" : ""}`}>
        <div className={"flex flex-col " + (preview === 'preview' ? "hidden" : "")}>
          <div className="flex flex-row justify-start mb-2 space-x-1">
            <ToolbarButtons />
          </div>
          <div
            className={"relative"}
            onDrop={(e) => {
              e.preventDefault();
              const editor = editorRef.current;
              if (!editor) return;
              for (let i = 0; i < e.dataTransfer.files.length; i++) {
                const selection = editor.getSelection();
                if (!selection) return;
                const file = e.dataTransfer.files[i];
                setUploading(true);
                uploadImage(file, (url) => {
                  setUploading(false);
                  editor.executeEdits(undefined, [{
                    range: selection,
                    text: `![${file.name}](${url})\n`,
                  }]);
                }, (msg) => console.error(msg));
              }
            }}
            onPaste={handlePaste}
          >
            <Editor
              onMount={handleEditorMount}
              height={height}
              defaultLanguage="markdown"
              defaultValue={content}
              theme={colorMode === "dark" ? "vs-dark" : "light"}
              options={{
                wordWrap: "on",

                // Chinese IME stability key
                fontFamily: "Sarasa Mono SC, JetBrains Mono, monospace",
                fontLigatures: false,
                letterSpacing: 0,

                fontSize: 14,
                lineNumbers: "off",

                accessibilitySupport: "off",
                unicodeHighlight: { ambiguousCharacters: false },

                renderWhitespace: "none",
                renderControlCharacters: false,
                smoothScrolling: false,

                dragAndDrop: true,
                pasteAs: { enabled: false },
              }}
            />
          </div>
        </div>
        <div
          className={"px-4 overflow-y-scroll " + (preview !== 'edit' ? "" : "hidden")}
          style={{ height: height }}
        >
          <Markdown content={content ? content : placeholder} />
        </div>
      </div>
    </div>
  );
}
