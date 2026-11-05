import { useEffect, useMemo, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

const KEY = 'handwritingValidation_v1'
const BASE = import.meta.env.BASE_URL
const MORE = 'more data'
const LATER = 'gpt later'
const OTHER = '__other'

const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}

const answerOf = (a) => (!a ? '' : a.v === OTHER ? (a.t || '').trim() : a.v || '')

function buildText(items, answers) {
  const out = ['VALIDATION ANSWERS (handwritingValidation)', '']
  items.forEach((it) => {
    const v = answerOf(answers[it.id])
    if (v) out.push(`[${it.id}] ${it.title}`, `  Answer: ${v}`, '')
  })
  return out.join('\n')
}

function download(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'Followups_answered.txt'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Viewer({ item }) {
  const images = useMemo(
    () => item.cards.flatMap((c) => c.images.map((im, i) => ({
      src: BASE + 'images/' + im.f,
      a: im.a,
      label: c.images.length > 1 ? c.id + ' p' + (i + 1) : c.id,
      title: c.title,
      marks: (item.marks || []).filter((m) => m.card === c.id && m.page === i + 1),
    }))),
    [item],
  )
  const [n, setN] = useState(() => Math.max(0, images.findIndex((im) => im.marks.length)))
  const img = images[Math.min(n, images.length - 1)]
  const flagged = (im) => im.marks.length > 0
  return (
    <section className="viewer">
      {images.length > 1 && (
        <div className="chips">
          {images.map((im, i) => (
            <button key={im.src} className={i === n ? 'chip on' : 'chip'} onClick={() => setN(i)}>
              {flagged(im) ? '● ' : ''}{im.label}
            </button>
          ))}
        </div>
      )}
      <div className="cap">
        {img.label} · {img.title}{' '}
        <span>{flagged(img) ? '(red marks = the line in question) ' : ''}(pinch or double-tap to zoom)</span>
      </div>
      <TransformWrapper key={img.src} minScale={1} maxScale={6} doubleClick={{ mode: 'toggle', step: 2 }} centerOnInit>
        <TransformComponent wrapperClass="zoomwrap" contentClass="zoomcontent">
          <svg className="card" viewBox={'0 0 1 ' + img.a} role="img" aria-label={img.label + ' ' + img.title}>
            <image href={img.src} x="0" y="0" width="1" height={img.a} preserveAspectRatio="none" />
            {img.marks.map((m, i) => {
              const y = m.y0 * img.a
              const h = (m.y1 - m.y0) * img.a
              return (
                <g key={i}>
                  <rect x="0" y={y} width="1" height={h} fill="#d91a1a" opacity="0.1" />
                  <rect x="0" y={y} width="0.022" height={h} fill="#d91a1a" />
                  <rect x="0.978" y={y} width="0.022" height={h} fill="#d91a1a" />
                </g>
              )
            })}
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </section>
  )
}

function Question({ item, answer, onChange }) {
  const set = (v) => onChange({ v, t: answer?.t || '' })
  const choices = [
    ...item.options.map((o) => [o, o]),
    [MORE, 'Can’t tell'],
    [LATER, 'Let GPT figure it out later'],
  ]
  return (
    <section className="panel">
      <div className="group">{item.group}</div>
      <h2>{item.title}</h2>
      <p className="prompt">{item.prompt}</p>
      <div className="opts">
        {choices.map(([value, label]) => (
          <label key={value} className={answer?.v === value ? 'opt on' : 'opt'}>
            <input type="radio" name={item.id} checked={answer?.v === value} onChange={() => set(value)} />
            <span>{label}</span>
          </label>
        ))}
        <label className={answer?.v === OTHER ? 'opt on' : 'opt'}>
          <input type="radio" name={item.id} checked={answer?.v === OTHER} onChange={() => set(OTHER)} />
          <span>Other:</span>
          <input
            type="text"
            className="other"
            value={answer?.t || ''}
            onChange={(e) => {
              const t = e.target.value
              if (t.trim()) onChange({ v: OTHER, t })
              else onChange({ v: answer?.v === OTHER ? '' : answer?.v || '', t })
            }}
          />
        </label>
      </div>
    </section>
  )
}

export default function App() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState(load)
  const [page, setPage] = useState(() => {
    try { return Number(sessionStorage.getItem('hv_page') || 0) } catch { return 0 }
  })

  useEffect(() => {
    fetch(`${BASE}data/items.json`).then((r) => r.json()).then((d) => setItems(d.items)).catch((e) => setError(String(e)))
  }, [])
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(answers)) } catch { /* private mode */ }
  }, [answers])
  useEffect(() => {
    try { sessionStorage.setItem('hv_page', String(page)) } catch { /* ignore */ }
  }, [page])

  if (error) return <p className="msg">Could not load the questions: {error}</p>
  if (!items) return <p className="msg">Loading…</p>

  const last = items.length
  const p = Math.min(page, last)
  const done = items.filter((it) => answerOf(answers[it.id])).length
  const go = (d) => setPage((x) => Math.max(0, Math.min(last, x + d)))
  const text = () => buildText(items, answers)

  return (
    <div className="app">
      <header>
        <b>Handwriting validation</b>
        <span>{p < last ? `${p + 1} / ${last}` : 'Done'} · {done} answered</span>
      </header>
      {p < last ? (
        <main key={items[p].id}>
          <Viewer item={items[p]} />
          <Question item={items[p]} answer={answers[items[p].id]} onChange={(a) => setAnswers((s) => ({ ...s, [items[p].id]: a }))} />
        </main>
      ) : (
        <main className="final">
          <h2>All done</h2>
          <p>{done} of {last} answered. Download the file and send it back.</p>
          <button className="big" onClick={() => download(text())}>Download results file</button>
          <p className="small">You can go back and change any answer first. Your answers stay on this phone until you clear the browser data.</p>
        </main>
      )}
      <footer>
        <button onClick={() => go(-1)} disabled={p === 0}>‹ Back</button>
        {p < last ? <button className="mid" onClick={() => download(text())}>Download</button> : <span />}
        <button onClick={() => go(1)} disabled={p === last}>{p === last - 1 ? 'Finish ›' : 'Next ›'}</button>
      </footer>
    </div>
  )
}
