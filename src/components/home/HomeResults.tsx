import type { ReactNode } from 'react';
import { workLabel, workPath, type HomeWork } from '../../lib/home/catalog';
import type { HomeOpen } from './HomeTools';
import type { HomeData } from './useHomeData';

export function HomeResults({ data, open, renderWorkCard }: {
  data: Pick<HomeData, 'releases' | 'rows' | 'works'>
  open: HomeOpen
  renderWorkCard: (row: HomeWork) => ReactNode
}) {
  const completedLongform = data.works.filter(row => workLabel(row.work) === '长篇' && row.work.status === 'completed')

  return (
    <>
      <section className="lf-paper">
        <h3>已发布的创作版本</h3>
        <p>这里只列出真实发布记录。进入作品版本页阅读和导出。</p>
        {data.releases.map(release => {
          const row = data.rows.find(work => work.work.id === release.workId)!
          return (
            <article className="home-task" key={release.id}>
              <div>
                <small>{workLabel(row.work)} · {new Date(release.createdAt).toLocaleString()}</small>
                <h4>{row.work.title} · v{release.version}</h4>
                <p>{release.label}</p>
              </div>
              <button className="lf-action" onClick={() => void open(workPath(row, 'versions'), row)}>进入作品版本页</button>
            </article>
          )
        })}
        {!data.releases.length && <p>尚无独立作品发布版本。</p>}
      </section>
      <section className="lf-paper">
        <h3>已完成的长篇</h3>
        {completedLongform.map(renderWorkCard)}
        {!completedLongform.length && <p>还没有标记完成的长篇。</p>}
      </section>
    </>
  )
}
