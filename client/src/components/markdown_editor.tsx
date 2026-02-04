import Editor from '@monaco-editor/react';
import { editor, KeyMod, KeyCode, Range, Position } from 'monaco-editor';
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

  // 创建工具栏按钮的公共处理函数（复用快捷键逻辑）
  const handleMarkdownAction = (actionType: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const selection = editor.getSelection();
    if (!selection) return;
    const model = editor.getModel();
    if (!model) return;
    
    const selectedText = model.getValueInRange(selection);
    
    switch (actionType) {
      case 'bold':
        if (selectedText.startsWith('**') && selectedText.endsWith('**')) {
          const newText = selectedText.slice(2, -2);
          editor.executeEdits('bold', [{
            range: selection,
            text: newText,
          }]);
        } else {
          editor.executeEdits('bold', [{
            range: selection,
            text: `**${selectedText}**`,
          }]);
        }
        break;
        
      case 'italic':
        if (selectedText.startsWith('*') && selectedText.endsWith('*') && selectedText.length > 1) {
          const newText = selectedText.slice(1, -1);
          editor.executeEdits('italic', [{
            range: selection,
            text: newText,
          }]);
        } else {
          editor.executeEdits('italic', [{
            range: selection,
            text: `*${selectedText}*`,
          }]);
        }
        break;
        
      case 'link':
        let newText;
        let newSelection;
        
        if (selectedText) {
          newText = `[${selectedText}](url)`;
          newSelection = new Range(
            selection.startLineNumber,
            selection.startColumn + selectedText.length + 3,
            selection.endLineNumber,
            selection.startColumn + selectedText.length + 6
          );
        } else {
          newText = `[${t('link.placeholder') || '链接文本'}](url)`;
          const placeholderText = t('link.placeholder') || '链接文本';
          newSelection = new Range(
            selection.startLineNumber,
            selection.startColumn + 1,
            selection.startLineNumber,
            selection.startColumn + 1 + placeholderText.length
          );
        }
        
        editor.executeEdits('link', [{
          range: selection,
          text: newText,
        }]);
        
        if (newSelection) {
          editor.setSelection(newSelection);
          editor.focus();
        }
        break;
        
      case 'inline-code':
        if (selectedText.startsWith('`') && selectedText.endsWith('`') && selectedText.length > 1) {
          const newText = selectedText.slice(1, -1);
          editor.executeEdits('inline-code', [{
            range: selection,
            text: newText,
          }]);
        } else {
          editor.executeEdits('inline-code', [{
            range: selection,
            text: `\`${selectedText}\``,
          }]);
        }
        break;
        
      case 'code-block':
        let codeText;
        if (selectedText) {
          codeText = `\`\`\`\n${selectedText}\n\`\`\``;
        } else {
          codeText = `\`\`\`\n${t('code.language') || 'language'}\n\`\`\``;
        }
        
        editor.executeEdits('code-block', [{
          range: selection,
          text: codeText,
        }]);
        
        if (!selectedText) {
          const newSelection = new Range(
            selection.startLineNumber + 1,
            1,
            selection.startLineNumber + 1,
            9
          );
          editor.setSelection(newSelection);
          editor.focus();
        }
        break;
        
      case 'blockquote':
        let quoteText;
        if (selectedText) {
          const lines = selectedText.split('\n');
          quoteText = lines.map(line => `> ${line}`).join('\n');
        } else {
          quoteText = `> `;
        }
        
        editor.executeEdits('blockquote', [{
          range: selection,
          text: quoteText,
        }]);
        break;
        
      case 'unordered-list':
        let unorderedListText;
        if (selectedText) {
          const lines = selectedText.split('\n');
          unorderedListText = lines.map(line => `- ${line}`).join('\n');
        } else {
          unorderedListText = `- `;
        }
        
        editor.executeEdits('unordered-list', [{
          range: selection,
          text: unorderedListText,
        }]);
        break;
        
      case 'ordered-list':
        let orderedListText;
        if (selectedText) {
          const lines = selectedText.split('\n');
          orderedListText = lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
        } else {
          orderedListText = `1. `;
        }
        
        editor.executeEdits('ordered-list', [{
          range: selection,
          text: orderedListText,
        }]);
        break;
        
      case 'heading-1':
        handleHeadingAction(1, selection, model, selectedText);
        break;
      case 'heading-2':
        handleHeadingAction(2, selection, model, selectedText);
        break;
      case 'heading-3':
        handleHeadingAction(3, selection, model, selectedText);
        break;
      case 'heading-4':
        handleHeadingAction(4, selection, model, selectedText);
        break;
        
      case 'horizontal-rule':
        const hrText = `\n---\n`;
        editor.executeEdits('horizontal-rule', [{
          range: selection,
          text: hrText,
        }]);
        
        const newPosition = new Position(
          selection.startLineNumber + 2,
          1
        );
        editor.setPosition(newPosition);
        editor.focus();
        break;
        
      case 'strikethrough':
        if (selectedText.startsWith('~~') && selectedText.endsWith('~~')) {
          const newText = selectedText.slice(2, -2);
          editor.executeEdits('strikethrough', [{
            range: selection,
            text: newText,
          }]);
        } else {
          editor.executeEdits('strikethrough', [{
            range: selection,
            text: `~~${selectedText}~~`,
          }]);
        }
        break;
        
      case 'table':
        const tableText = `| ${t('table.header') || '标题'} 1 | ${t('table.header') || '标题'} 2 | ${t('table.header') || '标题'} 3 |\n| --- | --- | --- |\n| ${t('table.content') || '内容'} 1 | ${t('table.content') || '内容'} 2 | ${t('table.content') || '内容'} 3 |\n`;
        editor.executeEdits('table', [{
          range: selection,
          text: tableText,
        }]);
        break;
        
      case 'task-list':
        let taskText;
        if (selectedText) {
          const lines = selectedText.split('\n');
          taskText = lines.map(line => `- [ ] ${line}`).join('\n');
        } else {
          taskText = `- [ ] `;
        }
        
        editor.executeEdits('task-list', [{
          range: selection,
          text: taskText,
        }]);
        break;
        
      case 'clear-format':
        // 清除格式：移除选中文本中的所有Markdown标记
        let cleanText = selectedText
          .replace(/\*\*(.*?)\*\*/g, '$1') // 移除加粗
          .replace(/\*(.*?)\*/g, '$1')    // 移除斜体
          .replace(/~~(.*?)~~/g, '$1')    // 移除删除线
          .replace(/`(.*?)`/g, '$1')      // 移除行内代码
          .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 移除链接，保留文本
          .replace(/^#+\s*/gm, '')        // 移除标题标记
          .replace(/^>\s*/gm, '')         // 移除引用标记
          .replace(/^[*-]\s*/gm, '')      // 移除无序列表标记
          .replace(/^\d+\.\s*/gm, '');    // 移除有序列表标记
        
        editor.executeEdits('clear-format', [{
          range: selection,
          text: cleanText,
        }]);
        break;
        
      case 'increase-indent':
        if (selectedText) {
          const lines = selectedText.split('\n');
          const indentedText = lines.map(line => `    ${line}`).join('\n');
          editor.executeEdits('increase-indent', [{
            range: selection,
            text: indentedText,
          }]);
        } else {
          // 在当前行首增加缩进
          const lineNumber = selection.startLineNumber;
          const lineContent = model.getLineContent(lineNumber);
          const newLineContent = `    ${lineContent}`;
          const lineRange = new Range(
            lineNumber, 1,
            lineNumber, model.getLineLength(lineNumber) + 1
          );
          editor.executeEdits('increase-indent', [{
            range: lineRange,
            text: newLineContent,
          }]);
        }
        break;
        
      case 'decrease-indent':
        if (selectedText) {
          const lines = selectedText.split('\n');
          const dedentedText = lines.map(line => 
            line.replace(/^ {1,4}/, '')
          ).join('\n');
          editor.executeEdits('decrease-indent', [{
            range: selection,
            text: dedentedText,
          }]);
        } else {
          // 在当前行首减少缩进
          const lineNumber = selection.startLineNumber;
          const lineContent = model.getLineContent(lineNumber);
          const newLineContent = lineContent.replace(/^ {1,4}/, '');
          const lineRange = new Range(
            lineNumber, 1,
            lineNumber, model.getLineLength(lineNumber) + 1
          );
          editor.executeEdits('decrease-indent', [{
            range: lineRange,
            text: newLineContent,
          }]);
        }
        break;
    }
  };
  
  // 标题操作的辅助函数
  const handleHeadingAction = (level: number, selection: any, model: any, selectedText: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const hashes = '#'.repeat(level);
    let newText;
    
    const line = model.getLineContent(selection.startLineNumber);
    const headingRegex = /^(#{1,6})\s/;
    const match = line.match(headingRegex);
    
    if (match && match[1].length === level) {
      newText = line.replace(headingRegex, '');
    } else if (match) {
      newText = line.replace(headingRegex, `${hashes} `);
    } else if (selectedText) {
      newText = `${hashes} ${selectedText}`;
    } else {
      newText = `${hashes} `;
    }
    
    if (!selectedText) {
      const lineRange = new Range(
        selection.startLineNumber,
        1,
        selection.startLineNumber,
        model.getLineLength(selection.startLineNumber) + 1
      );
      editor.executeEdits(`heading-${level}`, [{
        range: lineRange,
        text: newText,
      }]);
    } else {
      editor.executeEdits(`heading-${level}`, [{
        range: selection,
        text: newText,
      }]);
    }
  };

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
      <button onClick={() => uploadRef.current?.click()} title={t('upload.image') || '上传图片'}>
        <input
          ref={uploadRef}
          onChange={upChange}
          className="hidden"
          type="file"
          accept="image/gif,image/jpeg,image/jpg,image/png,image/webp,image/svg+xml"
        />
        <i className="ri-image-add-line" />
      </button>
    );
  }

  // 增强的工具栏组件
  function EnhancedToolbar() {
    // 创建按钮组，方便组织
    const buttonGroups = [
      {
        name: 'text-format',
        buttons: [
          { id: 'bold', icon: 'ri-bold', title: t('bold') || '加粗', action: 'bold' },
          { id: 'italic', icon: 'ri-italic', title: t('italic') || '斜体', action: 'italic' },
          { id: 'strikethrough', icon: 'ri-strikethrough', title: t('strikethrough') || '删除线', action: 'strikethrough' },
          { id: 'clear-format', icon: 'ri-format-clear', title: t('clear.format') || '清除格式', action: 'clear-format' },
        ]
      },
      {
        name: 'headings',
        buttons: [
          { id: 'heading-1', icon: 'ri-h-1', title: t('heading.1') || '标题1', action: 'heading-1' },
          { id: 'heading-2', icon: 'ri-h-2', title: t('heading.2') || '标题2', action: 'heading-2' },
          { id: 'heading-3', icon: 'ri-h-3', title: t('heading.3') || '标题3', action: 'heading-3' },
          { id: 'heading-4', icon: 'ri-h-4', title: t('heading.4') || '标题4', action: 'heading-4' },
        ]
      },
      {
        name: 'lists',
        buttons: [
          { id: 'unordered-list', icon: 'ri-list-unordered', title: t('unordered.list') || '无序列表', action: 'unordered-list' },
          { id: 'ordered-list', icon: 'ri-list-ordered', title: t('ordered.list') || '有序列表', action: 'ordered-list' },
          { id: 'task-list', icon: 'ri-task-line', title: t('task.list') || '任务列表', action: 'task-list' },
        ]
      },
      {
        name: 'code',
        buttons: [
          { id: 'inline-code', icon: 'ri-code-line', title: t('inline.code') || '行内代码', action: 'inline-code' },
          { id: 'code-block', icon: 'ri-code-box-line', title: t('code.block') || '代码块', action: 'code-block' },
        ]
      },
      {
        name: 'blocks',
        buttons: [
          { id: 'blockquote', icon: 'ri-double-quotes-l', title: t('blockquote') || '引用', action: 'blockquote' },
          { id: 'horizontal-rule', icon: 'ri-separator', title: t('horizontal.rule') || '分割线', action: 'horizontal-rule' },
          { id: 'table', icon: 'ri-table-line', title: t('table') || '表格', action: 'table' },
        ]
      },
      {
        name: 'formatting',
        buttons: [
          { id: 'link', icon: 'ri-link', title: t('link') || '链接', action: 'link' },
          { id: 'increase-indent', icon: 'ri-indent-increase', title: t('increase.indent') || '增加缩进', action: 'increase-indent' },
          { id: 'decrease-indent', icon: 'ri-indent-decrease', title: t('decrease.indent') || '减少缩进', action: 'decrease-indent' },
        ]
      },
      {
        name: 'media',
        buttons: [
          { id: 'upload-image', component: <UploadImageButton key="upload-image" /> },
        ]
      }
    ];

    return (
      <div className="flex flex-wrap items-center gap-1 p-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
        {buttonGroups.map((group, groupIndex) => (
          <React.Fragment key={group.name}>
            {group.buttons.map((button) => (
              button.component ? (
                <span key={button.id} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
                  {button.component}
                </span>
              ) : (
                <button
                  key={button.id}
                  onClick={() => handleMarkdownAction(button.action)}
                  title={button.title}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center justify-center"
                >
                  <i className={button.icon} />
                </button>
              )
            ))}
            {groupIndex < buttonGroups.length - 1 && (
              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
            )}
          </React.Fragment>
        ))}
      </div>
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

    // 原有的快捷键代码保持不变，只添加新增功能的快捷键
    // 1. 加粗文本: Ctrl/Cmd + B
    editorInstance.addAction({
      id: 'markdown-bold',
      label: 'Toggle Bold',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyB],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 1,
      run: () => handleMarkdownAction('bold')
    });

    // 2. 斜体文本: Ctrl/Cmd + I
    editorInstance.addAction({
      id: 'markdown-italic',
      label: 'Toggle Italic',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyI],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 2,
      run: () => handleMarkdownAction('italic')
    });

    // 3. 插入链接: Ctrl/Cmd + K
    editorInstance.addAction({
      id: 'markdown-link',
      label: 'Insert Link',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyK],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 3,
      run: () => handleMarkdownAction('link')
    });

    // 4. 插入代码: Ctrl/Cmd + `
    editorInstance.addAction({
      id: 'markdown-inline-code',
      label: 'Insert Inline Code',
      keybindings: [KeyMod.CtrlCmd | KeyCode.Backquote],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 4,
      run: () => handleMarkdownAction('inline-code')
    });

    // 5. 插入代码块: Ctrl/Cmd + Shift + `
    editorInstance.addAction({
      id: 'markdown-code-block',
      label: 'Insert Code Block',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backquote],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 5,
      run: () => handleMarkdownAction('code-block')
    });

    // 6. 插入引用块: Ctrl/Cmd + Shift + Q
    editorInstance.addAction({
      id: 'markdown-blockquote',
      label: 'Insert Blockquote',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyQ],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 6,
      run: () => handleMarkdownAction('blockquote')
    });

    // 7. 插入无序列表: Ctrl/Cmd + Shift + L
    editorInstance.addAction({
      id: 'markdown-unordered-list',
      label: 'Insert Unordered List',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 7,
      run: () => handleMarkdownAction('unordered-list')
    });

    // 8. 插入有序列表: Ctrl/Cmd + Shift + O
    editorInstance.addAction({
      id: 'markdown-ordered-list',
      label: 'Insert Ordered List',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 8,
      run: () => handleMarkdownAction('ordered-list')
    });

    // 9. 插入标题 (多个级别): Ctrl/Cmd + Alt + 1~6
    for (let level = 1; level <= 6; level++) {
      editorInstance.addAction({
        id: `markdown-heading-${level}`,
        label: `Insert Heading ${level}`,
        keybindings: [KeyMod.CtrlCmd | KeyMod.Alt | (KeyCode.Digit0 + level)],
        contextMenuGroupId: 'markdown',
        contextMenuOrder: 9 + level,
        run: () => handleMarkdownAction(`heading-${level}`)
      });
    }

    // 10. 插入水平分割线: Ctrl/Cmd + Shift + H
    editorInstance.addAction({
      id: 'markdown-horizontal-rule',
      label: 'Insert Horizontal Rule',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 16,
      run: () => handleMarkdownAction('horizontal-rule')
    });

    // 11. 插入删除线: Ctrl/Cmd + Shift + S
    editorInstance.addAction({
      id: 'markdown-strikethrough',
      label: 'Toggle Strikethrough',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 17,
      run: () => handleMarkdownAction('strikethrough')
    });

    // 12. 插入表格: Ctrl/Cmd + Shift + T
    editorInstance.addAction({
      id: 'markdown-table',
      label: 'Insert Table',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 18,
      run: () => handleMarkdownAction('table')
    });

    // 13. 插入任务列表: Ctrl/Cmd + Shift + C
    editorInstance.addAction({
      id: 'markdown-task-list',
      label: 'Insert Task List',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 19,
      run: () => handleMarkdownAction('task-list')
    });

    // 14. 清除格式: Ctrl/Cmd + Shift + Space
    editorInstance.addAction({
      id: 'markdown-clear-format',
      label: 'Clear Formatting',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 20,
      run: () => handleMarkdownAction('clear-format')
    });

    // 15. 增加缩进: Tab
    editorInstance.addAction({
      id: 'markdown-increase-indent',
      label: 'Increase Indent',
      keybindings: [KeyCode.Tab],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 21,
      run: () => handleMarkdownAction('increase-indent')
    });

    // 16. 减少缩进: Shift + Tab
    editorInstance.addAction({
      id: 'markdown-decrease-indent',
      label: 'Decrease Indent',
      keybindings: [KeyMod.Shift | KeyCode.Tab],
      contextMenuGroupId: 'markdown',
      contextMenuOrder: 22,
      run: () => handleMarkdownAction('decrease-indent')
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
          <EnhancedToolbar />
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
