import { useEffect, useMemo, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

const KEY = 'handwritingValidation_v1'
const BASE = import.meta.env.BASE_URL
const MORE = 'more data'
const LATER = 'gpt later'
const OTHER = '__other'

const SEEN_KEY = 'handwritingValidation_seen_v1'
const loadSeen = () => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') } catch { return {} }
}

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

function download(text, section) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'Followups_answered_' + section.replace(/[^A-Za-z0-9]+/g, '_') + '.txt'
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
          <svg className="card" viewBox={'-0.03 0 1.06 ' + img.a} role="img" aria-label={img.label + ' ' + img.title}>
            <rect x="-0.03" y="0" width="1.06" height={img.a} fill="#000" />
            <image href={img.src} x="0" y="0" width="1" height={img.a} preserveAspectRatio="none" />
            {img.marks.map((m, i) => {
              const y = m.y0 * img.a
              const h = (m.y1 - m.y0) * img.a
              return (
                <g key={i}>
                  <rect x="0" y={y} width="1" height={h} fill="#d91a1a" opacity="0.1" />
                  <rect x="-0.03" y={y} width="0.03" height={h} fill="#d91a1a" />
                  <rect x="1" y={y} width="0.03" height={h} fill="#d91a1a" />
                </g>
              )
            })}
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </section>
  )
}

function Dots({ items, p, answers, seen, onJump }) {
  return (
    <nav className="dots" aria-label="Questions in this section">
      {items.map((it, i) => {
        const st = answerOf(answers[it.id]) ? 'done' : seen[it.id] ? 'seen' : 'new'
        const word = st === 'done' ? 'answered' : st === 'seen' ? 'seen, not answered' : 'not seen yet'
        return (
          <button key={it.id} className={'dot ' + st + (i === p ? ' cur' : '')} aria-label={`Question ${i + 1}, ${word}`} aria-current={i === p ? 'true' : undefined} onClick={() => onJump(i)} />
        )
      })}
    </nav>
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
      {item.text && <pre className="transcript">{item.text}</pre>}
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
  const [all, setAll] = useState(null)
  const [section, setSection] = useState(() => {
    try { return sessionStorage.getItem('hv_section') || '' } catch { return '' }
  })
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState(load)
  const [seen, setSeen] = useState(loadSeen)
  const [page, setPage] = useState(() => {
    try { return Number(sessionStorage.getItem('hv_page') || 0) } catch { return 0 }
  })

  useEffect(() => {
    fetch(`${BASE}data/items.json`).then((r) => r.json()).then((d) => setAll(d.items)).catch((e) => setError(String(e)))
  }, [])
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(answers)) } catch { /* private mode */ }
  }, [answers])
  useEffect(() => {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)) } catch { /* private mode */ }
  }, [seen])
  useEffect(() => {
    if (!all || !section) return
    const list = all.filter((it) => it.section === section)
    const it = list[Math.min(page, list.length)]
    if (it) setSeen((s) => (s[it.id] ? s : { ...s, [it.id]: 1 }))
  }, [all, section, page])
  useEffect(() => {
    try { sessionStorage.setItem('hv_section', section) } catch { /* ignore */ }
  }, [section])
  useEffect(() => {
    try { sessionStorage.setItem('hv_page', String(page)) } catch { /* ignore */ }
  }, [page])

  if (error) return <p className="msg">Could not load the questions: {error}</p>
  if (!all) return <p className="msg">Loading…</p>

  const FULL = 'Full check: '
  const allSecs = [...new Set(all.map((it) => it.section))].sort()
  const sections = [...allSecs.filter((x) => !x.startsWith(FULL)), ...allSecs.filter((x) => x.startsWith(FULL))]
  const items = all.filter((it) => it.section === section)
  if (!items.length) {
    return (
      <div className="app">
        <header><b>Handwriting validation</b></header>
        <main className="final sections">
          <h2>Choose a section</h2>
          <p>Pick one. Answer its questions, then download that section’s file and send it back. Come back for the next section any time.</p>
          {sections.map((sec, si) => {
            const list = all.filter((it) => it.section === sec)
            const n = list.filter((it) => answerOf(answers[it.id])).length
            const sn = list.filter((it) => seen[it.id]).length
            const firstFull = sec.startsWith(FULL) && (si === 0 || !sections[si - 1].startsWith(FULL))
            const firstOpen = si === 0 && !sec.startsWith(FULL)
            return (
              <div key={sec} className="secwrap">
                {firstOpen && <h3 className="sech">Open questions</h3>}
                {firstFull && <h3 className="sech">Check whole cards against the typed text</h3>}
              <button className="sec" onClick={() => { setPage(0); setSection(sec) }}>
                <span>{sec.startsWith(FULL) ? sec.slice(FULL.length) : sec}</span>
                <span className="cnt">
                  <span>{n === list.length ? '✓ ' : ''}{n} / {list.length} answered</span>
                  <span className="sub">{sn === list.length ? 'all seen' : sn === 0 ? 'not seen yet' : `${sn} of ${list.length} seen`}</span>
                </span>
              </button>
              </div>
            )
          })}
        </main>
      </div>
    )
  }

  const last = items.length
  const p = Math.min(page, last)
  const done = items.filter((it) => answerOf(answers[it.id])).length
  const go = (d) => setPage((x) => Math.max(0, Math.min(last, x + d)))
  const text = () => buildText(items, answers)

  return (
    <div className="app">
      <header>
        <button className="back" onClick={() => setSection('')}>‹ Sections</button>
        <b>{section}</b>
        <span>{p < last ? `${p + 1} / ${last}` : 'Done'} · {done} answered</span>
      </header>
      <Dots items={items} p={p} answers={answers} seen={seen} onJump={(i) => setPage(i)} />
      {p < last ? (
        <main key={items[p].id}>
          <Viewer item={items[p]} />
          <Question item={items[p]} answer={answers[items[p].id]} onChange={(a) => setAnswers((s) => ({ ...s, [items[p].id]: a }))} />
        </main>
      ) : (
        <main className="final">
          <h2>All done</h2>
          <p>{done} of {last} answered. Download the {section} file and send it back.</p>
          <button className="big" onClick={() => download(text(), section)}>Download results file</button>
          <button className="alt" onClick={() => setSection('')}>Choose another section</button>
          <p className="small">You can go back and change any answer first. Your answers stay on this phone until you clear the browser data.</p>
        </main>
      )}
      <footer>
        <button onClick={() => go(-1)} disabled={p === 0}>‹ Back</button>
        {p < last ? <button className="mid" onClick={() => download(text(), section)}>Download</button> : <span />}
        <button onClick={() => go(1)} disabled={p === last}>{p === last - 1 ? 'Finish ›' : 'Next ›'}</button>
      </footer>
    </div>
  )
}
