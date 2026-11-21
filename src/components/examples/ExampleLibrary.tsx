import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import './examples.css'

const Sources = lazy(() => import('./SourceExamples'))

export function ExampleShelf() {
  return <section className="lf-paper example-shelf" aria-label="长篇示例作品">
    <div className="example-heading"><div><small>LONGFORM WORKSPACE</small><h3>从一部原作开始体验长篇工作台</h3><p>创建独立副本，不修改示例原文。</p></div><Link className="lf-action" to="/home/examples">浏览长篇示例</Link></div>
  </section>
}

export default function ExampleLibrary(_props: { kind?: 'long' }) {
  return <section className="example-library" aria-label="长篇示例作品">
    <header className="example-heading"><div><h3>长篇工作台示例</h3><p>从示例原作创建独立长篇副本，原文保持不变。</p></div></header>
    <Suspense fallback={<p role="status">正在打开长篇示例…</p>}><Sources/></Suspense>
  </section>
}
