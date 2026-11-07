import { Link } from 'react-router-dom';
import { FactionBadge } from '../ui/components/FactionBadge';
import { IconExternal, IconShield } from '../ui/components/icons';
import { PageHeader } from '../ui/components/PageHeader';

const REPO_URL = 'https://github.com/FengFaQ/Fards';

const SECTIONS = [
  {
    title: '项目定位',
    body: [
      'Fards 是一个开源的网页版 KARDS 卡组构筑与对战测试工具，面向希望快速验证卡组曲线、开局节奏与对局强度的玩家。',
      '本项目不提供账号系统、不联网对战、不涉及任何付费功能；所有卡组数据仅保存在本机浏览器（localStorage）。',
    ],
  },
  {
    title: '数据与素材',
    body: [
      '卡牌名称、效果文本与卡图素材版权归 1939 Games 所有，数据经由公开 API 获取，仅用于卡组测试与娱乐展示。',
      '卡图优先使用本地缓存文件；缺失时回退到官方图片代理地址。若版权方提出要求，本项目会及时下架相关素材。',
    ],
  },
  {
    title: '开源协议',
    body: [
      '本项目以 GNU Affero General Public License v3.0（AGPL-3.0）开源，允许自由使用、修改与分发，但衍生作品需以相同协议公开。',
      '仓库地址见页面底部 GitHub 链接，欢迎提交 issue 与 PR。',
    ],
  },
  {
    title: '出图协议',
    body: [
      '通过 URL 携带 ?action=overview_horizontal|overview_vertical|print_template 与 deck_code 参数，可直接渲染卡组概览图，便于分享或打印。',
      '该协议与 KARDS 社区常用的出图链接兼容，具体尺寸与排版由概览图页面负责。',
    ],
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="关于 / ABOUT"
        title="关于 Fards"
        subtitle="非官方同人项目 · 开源 · 仅供卡组测试与娱乐"
      />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          {SECTIONS.map((section) => (
            <section key={section.title} className="fards-panel p-4 sm:p-5">
              <h2 className="fards-title mb-2 text-sm">{section.title}</h2>
              <div className="space-y-2">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="font-body text-[12px] leading-relaxed text-field-300">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-4">
          <section className="fards-panel p-4">
            <h2 className="fards-title mb-2 text-sm">技术栈</h2>
            <ul className="space-y-1 font-body text-[11px] text-field-400">
              {['Vite 8', 'React 19', 'TypeScript 5.9', 'Tailwind CSS 4', 'zustand 5', 'react-router-dom 7'].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-brass-500" />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </section>

          <section className="fards-panel p-4">
            <h2 className="fards-title mb-2 text-sm">阵营一览</h2>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Germany',
                'USA',
                'Britain',
                'Japan',
                'Soviet',
                'France',
                'Italy',
                'Finland',
                'Poland',
                'Anzac',
                'Neutral',
              ].map((faction) => (
                <FactionBadge key={faction} faction={faction} size="xs" />
              ))}
            </div>
          </section>

          <section className="fards-panel p-4">
            <h2 className="fards-title mb-2 text-sm">链接</h2>
            <div className="space-y-2">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between rounded-sm border border-field-600/60 px-2.5 py-2 font-body text-[11px] text-field-200 transition-colors hover:border-brass-600/60 hover:text-brass-300"
              >
                GitHub 仓库
                <IconExternal size={13} />
              </a>
              <Link
                to="/deck"
                className="flex items-center justify-between rounded-sm border border-field-600/60 px-2.5 py-2 font-body text-[11px] text-field-200 transition-colors hover:border-brass-600/60 hover:text-brass-300"
              >
                卡组构筑
              </Link>
              <Link
                to="/cards"
                className="flex items-center justify-between rounded-sm border border-field-600/60 px-2.5 py-2 font-body text-[11px] text-field-200 transition-colors hover:border-brass-600/60 hover:text-brass-300"
              >
                卡牌图鉴
              </Link>
            </div>
          </section>

          <section className="fards-panel fards-rivets p-4">
            <div className="flex items-center gap-2 text-brass-400">
              <IconShield size={16} />
              <span className="fards-label text-brass-400">免责声明</span>
            </div>
            <p className="mt-2 font-body text-[11px] leading-relaxed text-field-400">
              本项目为粉丝作品，与 1939 Games 无关联。KARDS 及相关素材版权归 1939 Games 所有，如有侵权请联系仓库维护者下架。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
