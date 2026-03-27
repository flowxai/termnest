import { Allotment } from 'allotment';
import { useAppStore } from './store';

export function App() {
  const aiPanelVisible = useAppStore((s) => s.aiPanelVisible);

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-[#1a1a2e] border-b border-[#333] text-xs text-[#a0a0c0]">
        <span className="font-bold text-[#7c83ff]">Mini-Term</span>
        <span className="opacity-40">|</span>
        <span className="cursor-pointer hover:text-white">终端</span>
        <span className="cursor-pointer hover:text-white">设置</span>
      </div>

      {/* 主体三栏 */}
      <div className="flex-1 overflow-hidden">
        <Allotment>
          {/* 左栏：项目列表 */}
          <Allotment.Pane preferredSize={200} minSize={140} maxSize={350}>
            <div className="h-full bg-[#12121f] p-2 text-xs text-gray-400">
              项目列表占位
            </div>
          </Allotment.Pane>

          {/* 中栏：文件树 */}
          <Allotment.Pane preferredSize={280} minSize={180}>
            <div className="h-full bg-[#16162a] p-2 text-xs text-gray-400">
              文件树占位
            </div>
          </Allotment.Pane>

          {/* 右栏：终端 + AI 历史 */}
          <Allotment.Pane>
            <Allotment>
              <Allotment.Pane>
                <div className="h-full bg-[#0d0d1a] p-2 text-xs text-gray-400">
                  终端区域占位
                </div>
              </Allotment.Pane>

              {aiPanelVisible && (
                <Allotment.Pane preferredSize={180} minSize={140} maxSize={280} snap>
                  <div className="h-full bg-[#12121f] border-l-2 border-[#7c83ff33] p-2 text-xs text-gray-400">
                    AI 历史占位
                  </div>
                </Allotment.Pane>
              )}
            </Allotment>
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
}
