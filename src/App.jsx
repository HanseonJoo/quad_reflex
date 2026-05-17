import React, { useEffect, useMemo, useRef, useState } from 'react'

const DIFFICULTIES = {
  easy: { label: 'Easy', description: '느리게 점등 · 입문용', flashMs: 1100, gapMs: 360 },
  normal: { label: 'Normal', description: '기본 속도 · 추천', flashMs: 850, gapMs: 300 },
  hard: { label: 'Hard', description: '빠른 점등 · 실전용', flashMs: 620, gapMs: 230 },
  pro: { label: 'Pro', description: '매우 빠름 · 고수용', flashMs: 470, gapMs: 190 },
}

const ROUND_OPTIONS = [10, 20, 30]
const STORAGE_KEY = 'quad-reflex-best-v1'
const PLAYABLE_CELLS = [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]
const REMOVED_CELLS = new Set([5, 6, 9, 10])

function loadBestScores() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveBestScores(scores) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores))
  } catch {}
}

function formatMs(value) {
  return Number.isFinite(value) ? `${Math.round(value)}ms` : '-'
}

function getGrade(score, avgReaction, errors, roundCount) {
  const normalized = score / roundCount
  const errorRate = errors / roundCount
  if (!Number.isFinite(avgReaction)) return '-'
  if (normalized >= 90 && avgReaction <= 360 && errorRate <= 0.08) return 'S'
  if (normalized >= 75 && avgReaction <= 430 && errorRate <= 0.15) return 'A'
  if (normalized >= 58 && avgReaction <= 520 && errorRate <= 0.24) return 'B'
  if (normalized >= 40) return 'C'
  return 'D'
}

export default function App() {
  const [difficulty, setDifficulty] = useState('normal')
  const [roundCount, setRoundCount] = useState(10)
  const [phase, setPhase] = useState('idle')
  const [round, setRound] = useState(0)
  const [active, setActive] = useState(null)
  const [message, setMessage] = useState('불이 들어온 칸을 빠르게 누르세요.')
  const [bestScores, setBestScores] = useState(loadBestScores)
  const [stats, setStats] = useState({
    correct: 0,
    misses: 0,
    earlyClicks: 0,
    totalReaction: 0,
    bestReaction: Infinity,
  })

  const showTimerRef = useRef(null)
  const expireTimerRef = useRef(null)
  const tokenRef = useRef(null)
  const settings = DIFFICULTIES[difficulty]
  const recordKey = `${difficulty}-${roundCount}`

  const summary = useMemo(() => {
    const attempts = stats.correct + stats.misses
    const avgReaction = stats.correct ? stats.totalReaction / stats.correct : Infinity
    const accuracy = attempts ? Math.round((stats.correct / attempts) * 100) : 0
    const score = Math.max(
      0,
      stats.correct * 100 -
        stats.misses * 60 -
        stats.earlyClicks * 10 -
        Math.max(0, Math.round((avgReaction - 300) / 8))
    )
    const grade = getGrade(score, avgReaction, stats.misses, roundCount)
    return { attempts, avgReaction, accuracy, score, grade, bestReaction: stats.bestReaction }
  }, [stats, roundCount])

  function clearTimers() {
    clearTimeout(showTimerRef.current)
    clearTimeout(expireTimerRef.current)
  }

  function resetStats() {
    setStats({
      correct: 0,
      misses: 0,
      earlyClicks: 0,
      totalReaction: 0,
      bestReaction: Infinity,
    })
  }

  function startGame() {
    clearTimers()
    tokenRef.current = null
    setActive(null)
    resetStats()
    setRound(0)
    setPhase('playing')
    setMessage('준비... 불이 들어온 칸을 누르세요.')
  }

  function finishGame() {
    clearTimers()
    tokenRef.current = null
    setActive(null)
    setPhase('finished')
    setMessage('테스트 완료. 결과를 확인하세요.')
  }

  useEffect(() => {
    if (phase !== 'playing') return undefined
    if (round >= roundCount) {
      finishGame()
      return undefined
    }

    showTimerRef.current = setTimeout(() => {
      const cell = PLAYABLE_CELLS[Math.floor(Math.random() * PLAYABLE_CELLS.length)]
      const token = `${round}-${Date.now()}-${Math.random()}`
      const litAt = performance.now()

      tokenRef.current = token
      setActive({ cell, litAt, token })
      setMessage('해당 칸을 누르세요.')

      expireTimerRef.current = setTimeout(() => {
        if (tokenRef.current !== token) return

        tokenRef.current = null
        setActive(null)
        setStats(prev => ({ ...prev, misses: prev.misses + 1 }))
        setMessage('놓쳤습니다.')
        setRound(prev => prev + 1)
      }, settings.flashMs)
    }, settings.gapMs)

    return clearTimers
  }, [phase, round, roundCount, settings.flashMs, settings.gapMs])

  useEffect(() => () => clearTimers(), [])

  useEffect(() => {
    if (phase !== 'finished') return

    const previous = bestScores[recordKey]
    const shouldUpdate =
      !previous ||
      summary.score > previous.score ||
      (summary.score === previous.score && summary.avgReaction < previous.avgReaction)

    if (!shouldUpdate) return

    const updated = {
      ...bestScores,
      [recordKey]: {
        score: summary.score,
        avgReaction: Number.isFinite(summary.avgReaction) ? Math.round(summary.avgReaction) : null,
        accuracy: summary.accuracy,
        grade: summary.grade,
        date: new Date().toISOString(),
      },
    }

    setBestScores(updated)
    saveBestScores(updated)
  }, [phase])

  function handleCellPress(index) {
    if (phase !== 'playing') return
    if (REMOVED_CELLS.has(index)) return

    if (!active) {
      setStats(prev => ({ ...prev, earlyClicks: prev.earlyClicks + 1 }))
      setMessage('불이 들어오기 전에 누르면 감점입니다.')
      return
    }

    clearTimers()
    tokenRef.current = null

    if (index !== active.cell) {
      setStats(prev => ({ ...prev, misses: prev.misses + 1 }))
      setMessage('다른 칸을 눌렀습니다.')
      setActive(null)
      setRound(prev => prev + 1)
      return
    }

    const reaction = performance.now() - active.litAt

    setStats(prev => ({
      ...prev,
      correct: prev.correct + 1,
      totalReaction: prev.totalReaction + reaction,
      bestReaction: Math.min(prev.bestReaction, reaction),
    }))

    setMessage(`${Math.round(reaction)}ms`)
    setActive(null)
    setRound(prev => prev + 1)
  }

  useEffect(() => {
    function onKeyDown(event) {
      const keyMap = {
        '1': 0,
        '2': 1,
        '3': 2,
        '4': 3,
        q: 4,
        r: 7,
        a: 8,
        f: 11,
        z: 12,
        x: 13,
        c: 14,
        v: 15,
      }

      const index = keyMap[event.key.toLowerCase()]
      if (index === undefined) return
      handleCellPress(index)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  async function copyResult() {
    const text = `Quad Reflex ${settings.label} ${roundCount}R 결과: ${summary.score}점, 평균 ${formatMs(summary.avgReaction)}, 정확도 ${summary.accuracy}%, 등급 ${summary.grade}.`

    try {
      await navigator.clipboard.writeText(text)
      setMessage('결과 문구를 복사했습니다.')
    } catch {
      setMessage('복사에 실패했습니다.')
    }
  }

  const progress = Math.min(100, Math.round((round / roundCount) * 100))
  const currentBest = bestScores[recordKey]

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-center text-sm text-slate-400 shadow-2xl shadow-black/20">
        </div>

        <header className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <div>
            <p className="mb-3 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-sm font-medium text-cyan-200">
              Gamer Reaction Test
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
              Quad Reflex
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              12칸 중 한 칸에 불이 들어옵니다. 불이 들어온 칸을 최대한 빠르게 누르며 반응속도와 정확도를 측정합니다.
            </p>
          </div>

          <div className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <ControlGroup title="라운드">
              {ROUND_OPTIONS.map(count => (
                <OptionButton
                  key={count}
                  active={roundCount === count}
                  disabled={phase === 'playing'}
                  onClick={() => phase !== 'playing' && setRoundCount(count)}
                  title={`${count} 라운드`}
                  subtitle={count === 10 ? '짧은 테스트' : '정확한 측정'}
                  color="emerald"
                />
              ))}
            </ControlGroup>

            <ControlGroup title="난이도">
              {Object.entries(DIFFICULTIES).map(([key, item]) => (
                <OptionButton
                  key={key}
                  active={difficulty === key}
                  disabled={phase === 'playing'}
                  onClick={() => phase !== 'playing' && setDifficulty(key)}
                  title={item.label}
                  subtitle={item.description}
                />
              ))}
            </ControlGroup>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-2xl shadow-black/30 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">진행률</p>
                <p className="text-xl font-bold text-white">{round}/{roundCount}</p>
              </div>

              <div className="min-w-[180px] flex-1 rounded-full bg-slate-800 p-1 sm:max-w-xs">
                <div
                  className="h-2 rounded-full bg-cyan-300 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <button
                onClick={startGame}
                className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200 active:scale-[0.98]"
              >
                {phase === 'playing' ? '다시 시작' : '게임 시작'}
              </button>
            </div>

            <div className="mx-auto grid aspect-square w-full max-w-[500px] grid-cols-4 gap-2 rounded-[1.5rem] border border-slate-800 bg-slate-950 p-2 sm:gap-2.5 sm:p-3">
              {Array.from({ length: 16 }, (_, index) => index).map(index => {
                if (REMOVED_CELLS.has(index)) {
                  return <div key={index} aria-hidden="true" />
                }

                const isActive = active?.cell === index

                return (
                  <button
                    key={index}
                    onClick={() => handleCellPress(index)}
                    aria-label={`${index + 1}번 칸`}
                    className={`relative overflow-hidden rounded-xl border text-sm font-black transition duration-100 active:scale-[0.98] sm:rounded-2xl sm:text-xl ${
                      isActive
                        ? 'border-cyan-200 bg-cyan-400 text-cyan-950 shadow-[0_0_45px_rgba(34,211,238,0.75)]'
                        : 'border-slate-700 bg-white text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span className="absolute left-2 top-1.5 text-[10px] font-bold opacity-35 sm:left-3 sm:top-2 sm:text-xs">
                      {index + 1}
                    </span>
                    {isActive ? 'TAP' : ''}
                  </button>
                )
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-center">
              <p className="text-sm text-slate-400">상태</p>
              <p className="mt-1 text-xl font-black text-white">{message}</p>
              <p className="mt-2 text-xs text-slate-500">
              </p>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <Panel title="현재 결과">
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="평균 반응" value={formatMs(summary.avgReaction)} />
                <Stat label="최고 반응" value={formatMs(summary.bestReaction)} />
                <Stat label="정확도" value={`${summary.accuracy}%`} />
                <Stat label="성공" value={stats.correct} />
              </div>
            </Panel>

            <Panel title="공유">
              <p className="mt-2 text-sm leading-6 text-slate-300">
                결과 문구를 복사해 친구에게 도전장을 보낼 수 있습니다.
              </p>
              <button
                onClick={copyResult}
                disabled={phase !== 'finished'}
                className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-45"
              >
                결과 문구 복사
              </button>
            </Panel>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <InfoCard
            title="게임 방법"
            body="불이 들어온 칸을 누르세요. 한 번에 한 칸만 점등됩니다."
          />
          <InfoCard
            title="점수 기준"
            body="정답, 평균 반응속도, 놓친 횟수, 조기 클릭을 종합해 점수를 계산합니다. 10, 20, 30라운드는 기록이 따로 저장됩니다."
          />
          <InfoCard
            title="보안 설계"
            body="사용자 입력 HTML을 렌더링하지 않고, 기록은 브라우저 localStorage에만 저장합니다. 서버 계정·비밀번호·개인정보를 받지 않는 구조입니다."
          />
        </section>

        <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6 leading-7 text-slate-300">
          <h2 className="text-2xl font-black text-white">게이머 반응속도 테스트</h2>
          <p className="mt-3">
            Quad Reflex는 FPS, 리듬게임, MOBA 플레이어를 위한 반응속도 테스트입니다. 불이 들어온 칸을 빠르게 누르며 반응속도와 정확도를 측정합니다. 10라운드는 빠른 테스트용, 20라운드는 기본 측정용, 30라운드는 더 안정적인 기록 측정용입니다.
          </p>
          <p className="mt-3">
            이 영역은 검색 유입을 위한 설명 콘텐츠로도 사용할 수 있습니다. 나중에 “FPS 반응속도 평균”, “마우스 반응속도 테스트”, “집중력 테스트” 같은 글을 추가하면 사이트 확장에 도움이 됩니다.
          </p>
        </article>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-center text-sm text-slate-400">
        </div>

        <footer className="pb-8 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Quad Reflex. All rights reserved.
        </footer>
      </section>
    </main>
  )
}

function ControlGroup({ title, children }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

function OptionButton({ active, disabled, onClick, title, subtitle, color = 'cyan' }) {
  const activeClass =
    color === 'emerald'
      ? 'border-emerald-300 bg-emerald-300/15 text-emerald-100'
      : 'border-cyan-300 bg-cyan-300/15 text-cyan-100'

  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-3 text-left transition ${
        active ? activeClass : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span className="block text-sm font-bold">{title}</span>
      <span className="mt-1 block text-xs text-slate-400">{subtitle}</span>
    </button>
  )
}

function Panel({ title, children }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm font-semibold text-slate-400">{title}</p>
      {children}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  )
}

function InfoCard({ title, body }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-lg font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  )
}

