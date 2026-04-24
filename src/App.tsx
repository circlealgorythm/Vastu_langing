import { useEffect, useRef, useState, type CSSProperties } from 'react'
import templeModel from '../temple.glb?url'

type ModelViewerProps = {
  src: string
  alt: string
  className?: string
  style?: CSSProperties
  'auto-rotate'?: boolean
  'camera-controls'?: boolean
  'disable-zoom'?: boolean
  'interaction-prompt'?: string
  'rotation-per-second'?: string
  'auto-rotate-delay'?: string
  'camera-orbit'?: string
  'field-of-view'?: string
  'shadow-intensity'?: string
  exposure?: string
  loading?: string
}

const ModelViewer = 'model-viewer' as unknown as React.ComponentType<ModelViewerProps>

const HOUSE_FRAME_COUNT = 180
const houseFrameUrl = (index: number) =>
  `/house-frames/house-${String(index + 1).padStart(4, '0')}.jpg`

function ScrollScrubSequence() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const scene = sceneRef.current
    const canvas = canvasRef.current

    if (!scene || !canvas) {
      return undefined
    }

    const context = canvas.getContext('2d', { alpha: false })

    if (!context) {
      return undefined
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const frameCache = new Map<number, HTMLImageElement>()
    const loadingFrames = new Set<number>()
    let animationFrame = 0
    let isVisible = false
    let targetProgress = 0
    let renderedProgress = 0
    let renderedFrame = -1
    let canvasWidth = 0
    let canvasHeight = 0

    const clamp = (value: number) => Math.min(Math.max(value, 0), 1)
    const clampFrame = (index: number) => Math.min(Math.max(index, 0), HOUSE_FRAME_COUNT - 1)

    const readScrollProgress = () => {
      const rect = scene.getBoundingClientRect()
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const scrollableDistance = Math.max(rect.height - viewportHeight, 1)

      return clamp(-rect.top / scrollableDistance)
    }

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const nextWidth = Math.max(1, Math.round(rect.width * dpr))
      const nextHeight = Math.max(1, Math.round(rect.height * dpr))

      if (nextWidth !== canvasWidth || nextHeight !== canvasHeight) {
        canvasWidth = nextWidth
        canvasHeight = nextHeight
        canvas.width = nextWidth
        canvas.height = nextHeight
        context.setTransform(dpr, 0, 0, dpr, 0, 0)

        const currentImage = frameCache.get(renderedFrame)

        if (currentImage?.complete) {
          drawImage(currentImage)
        }
      }
    }

    const drawImage = (image: HTMLImageElement) => {
      const rect = canvas.getBoundingClientRect()
      const scale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      const x = (rect.width - width) / 2
      const y = (rect.height - height) / 2

      context.clearRect(0, 0, rect.width, rect.height)
      context.drawImage(image, x, y, width, height)
    }

    const drawNearestLoadedFrame = (frameIndex: number) => {
      for (let offset = 0; offset < HOUSE_FRAME_COUNT; offset += 1) {
        const previous = frameCache.get(frameIndex - offset)
        const next = frameCache.get(frameIndex + offset)

        if (previous?.complete) {
          drawImage(previous)
          return
        }

        if (next?.complete) {
          drawImage(next)
          return
        }
      }
    }

    const loadFrame = (frameIndex: number) => {
      const safeIndex = clampFrame(frameIndex)

      if (frameCache.has(safeIndex) || loadingFrames.has(safeIndex)) {
        return
      }

      loadingFrames.add(safeIndex)

      const image = new Image()
      image.decoding = 'async'
      image.onload = () => {
        loadingFrames.delete(safeIndex)
        frameCache.set(safeIndex, image)

        if (safeIndex === renderedFrame) {
          drawImage(image)
        }
      }
      image.onerror = () => {
        loadingFrames.delete(safeIndex)
      }
      image.src = houseFrameUrl(safeIndex)
    }

    const preloadAround = (frameIndex: number) => {
      for (let offset = -8; offset <= 12; offset += 1) {
        loadFrame(frameIndex + offset)
      }
    }

    const preloadAllFrames = () => {
      for (let index = 0; index < HOUSE_FRAME_COUNT; index += 1) {
        window.setTimeout(() => loadFrame(index), index * 12)
      }
    }

    const renderFrame = (progress: number) => {
      const frameIndex = clampFrame(Math.round(progress * (HOUSE_FRAME_COUNT - 1)))

      preloadAround(frameIndex)

      if (frameIndex !== renderedFrame) {
        renderedFrame = frameIndex
        const image = frameCache.get(frameIndex)

        if (image?.complete) {
          drawImage(image)
        } else {
          drawNearestLoadedFrame(frameIndex)
        }
      }
    }

    const syncFrameToScroll = () => {
      targetProgress = readScrollProgress()
      renderedProgress = targetProgress
      renderFrame(renderedProgress)
    }

    const tick = () => {
      if (!isVisible || reduceMotion.matches) {
        animationFrame = 0
        return
      }

      targetProgress = readScrollProgress()
      renderedProgress += (targetProgress - renderedProgress) * 0.18

      if (Math.abs(targetProgress - renderedProgress) < 0.001) {
        renderedProgress = targetProgress
      }

      renderFrame(renderedProgress)
      animationFrame = window.requestAnimationFrame(tick)
    }

    const startScrubbing = () => {
      if (!animationFrame && isVisible && !reduceMotion.matches) {
        animationFrame = window.requestAnimationFrame(tick)
      }
    }

    const stopScrubbing = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting

        if (isVisible) {
          syncFrameToScroll()
          startScrubbing()
        } else {
          stopScrubbing()
        }
      },
      { threshold: 0 },
    )

    const handleResize = () => {
      resizeCanvas()
      syncFrameToScroll()
      startScrubbing()
    }

    resizeCanvas()
    loadFrame(0)
    preloadAllFrames()
    observer.observe(scene)
    window.addEventListener('resize', handleResize)
    syncFrameToScroll()

    return () => {
      stopScrubbing()
      observer.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div className="vastu-scroll-scene reveal" ref={sceneRef}>
      <div className="vastu-video-sticky">
        <canvas
          ref={canvasRef}
          className="vastu-scroll-canvas"
          aria-label="Дом, кадры которого раскрываются по мере прокрутки"
        />
      </div>
    </div>
  )
}

const painPoints = [
  'Дом выглядит красивым, но внутри трудно расслабиться.',
  'Рабочее место забирает внимание быстрее, чем дает фокус.',
  'Ремонт уже сделан, а ощущение порядка и опоры не появилось.',
  'Планы двигаются тяжело, будто пространство держит старый сценарий.',
]

const mechanics = [
  {
    label: 'Север',
    title: 'Вектор ясности',
    text: 'Анализ входа, потоков движения и зон концентрации показывает, где пространство поддерживает решения, а где рассеивает внимание.',
  },
  {
    label: 'Центр',
    title: 'Точка тишины',
    text: 'Брахмастан рассматривается как внутренний центр дома: без визуального шума, тяжести и случайных перегрузок.',
  },
  {
    label: 'Юг',
    title: 'Опора и границы',
    text: 'Сильные зоны отвечают за устойчивость, приватность, накопление энергии и ощущение защищенности.',
  },
]

const packages = [
  {
    name: 'Диагностика',
    price: 'от 18 000 ₽',
    text: 'Для квартиры, кабинета или отдельной комнаты, когда нужно понять главные причины дискомфорта.',
    items: ['разбор планировки', 'карта зон', 'приоритеты коррекции', 'созвон 60 минут'],
  },
  {
    name: 'Гармонизация',
    price: 'от 48 000 ₽',
    text: 'Полная работа с пространством без обязательного ремонта: свет, цвет, функции, символы и сценарии.',
    items: ['персональные рекомендации', 'схема перестановок', 'палитра материалов', 'план внедрения'],
  },
  {
    name: 'Проект 2026',
    price: 'индивидуально',
    text: 'Сопровождение ремонта, переезда или создания премиального интерьера на основе принципов Васту.',
    items: ['аудит до покупки', 'работа с дизайнером', 'коррекции по этапам', 'финальная настройка'],
  },
]

const process = [
  'Знакомство и запрос',
  'План, стороны света и фото',
  'Диагностика зон',
  'Карта решений',
  'Внедрение и сопровождение',
]

const faq = [
  {
    q: 'Нужен ли ремонт, чтобы гармонизировать пространство?',
    a: 'Нет. Часто достаточно точной перестановки функций, света, цвета, текстиля и смысловых акцентов. Ремонт нужен только там, где запрос и планировка действительно требуют более глубокого вмешательства.',
  },
  {
    q: 'Васту подходит для современных квартир?',
    a: 'Да. Методика адаптируется к реальной архитектуре, городскому ритму и эстетике современного интерьера, без перегруза символами и чужеродным декором.',
  },
  {
    q: 'Можно работать онлайн?',
    a: 'Да. Для диагностики достаточно плана помещения, ориентации по сторонам света, фото и короткого интервью. Все решения передаются в понятной визуальной структуре.',
  },
  {
    q: 'Это эзотерика или дизайн-подход?',
    a: 'Работа находится на стыке традиционной системы Васту, психологии восприятия и практической организации пространства. Главный критерий - состояние человека внутри дома.',
  },
]

function App() {
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    void import('@google/model-viewer')

    const root = document.documentElement

    const handlePointer = (event: PointerEvent) => {
      root.style.setProperty('--pointer-x', `${event.clientX}px`)
      root.style.setProperty('--pointer-y', `${event.clientY}px`)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
          }
        })
      },
      { threshold: 0.16 },
    )

    document.querySelectorAll('.reveal').forEach((node) => observer.observe(node))
    window.addEventListener('pointermove', handlePointer, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('pointermove', handlePointer)
    }
  }, [])

  return (
    <main className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grain" />

      <header className="nav">
        <a className="brand" href="#top" aria-label="Vastu Space">
          <span>Vastu</span>
          <span>Space</span>
        </a>
        <nav aria-label="Главная навигация">
          <a href="#method">Метод</a>
          <a href="#packages">Пакеты</a>
          <a href="#process">Процесс</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="nav-cta" href="#consultation">
          Консультация
        </a>
      </header>

      <section className="hero section-grid" id="top">
        <div className="hero-copy reveal is-visible">
          <p className="kicker">Васту гармонизация пространства</p>
          <h1>Дом как тихая архитектура внутреннего состояния</h1>
          <p className="hero-lead">
            Диагностика и настройка квартиры, дома или рабочего пространства по
            принципам Васту: без мистического шума, с точной структурой,
            уважением к эстетике и вниманием к тому, как вы себя чувствуете
            внутри.
          </p>
        </div>

        <div className="hero-stage reveal is-visible" aria-label="3D модель храма">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="model-aura" />
          <ModelViewer
            src={templeModel}
            alt="Сакральный объект как визуальный центр гармонизации пространства"
            className="temple-model"
            auto-rotate
            camera-controls
            disable-zoom
            interaction-prompt="none"
            rotation-per-second="18deg"
            auto-rotate-delay="0"
            camera-orbit="35deg 68deg 9m"
            field-of-view="28deg"
            shadow-intensity="0.9"
            exposure="0.9"
            loading="eager"
          />
        </div>

        <div className="hero-bottom reveal is-visible">
          <div className="hero-actions" aria-label="Основные действия">
            <a className="button button-primary" href="#consultation">
              Получить разбор
            </a>
            <a className="button button-ghost" href="#method">
              Посмотреть метод
            </a>
          </div>
          <dl className="hero-metrics">
            <div>
              <dt>9</dt>
              <dd>секторов анализа</dd>
            </div>
            <div>
              <dt>72ч</dt>
              <dd>до первой карты</dd>
            </div>
            <div>
              <dt>0</dt>
              <dd>давления и обещаний</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="section problem" aria-labelledby="problem-title">
        <div className="section-heading reveal">
          <p className="kicker">Проблема</p>
          <h2 id="problem-title">Когда пространство не спорит, но постоянно сопротивляется</h2>
        </div>
        <div className="pain-grid">
          {painPoints.map((item, index) => (
            <article className="pain-card reveal" key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{item}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section vastuu" id="method">
        <div className="section-heading section-heading-wide reveal">
          <p className="kicker">Что такое Васту</p>
          <h2>Древняя система, переведенная на язык современного дома</h2>
        </div>
        <ScrollScrubSequence />
        <div className="text-column vastu-text reveal">
          <p>
            Васту рассматривает пространство как живую структуру: направление
            входа, центр помещения, расположение функций, свет, цвет и плотность
            предметов влияют на то, как человек отдыхает, работает, общается и
            восстанавливается.
          </p>
          <p>
            В современном подходе это не набор запретов, а деликатная настройка:
            убрать внутренний шум, усилить поддерживающие зоны и вернуть дому
            ощущение ясности.
          </p>
        </div>
      </section>

      <section className="section mechanics" aria-labelledby="mechanics-title">
        <div className="section-heading reveal">
          <p className="kicker">Механика</p>
          <h2 id="mechanics-title">Как энергия становится понятной системой решений</h2>
        </div>
        <div className="mechanics-grid">
          {mechanics.map((item) => (
            <article className="glass-panel reveal" key={item.label}>
              <span className="panel-label">{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section packages" id="packages" aria-labelledby="packages-title">
        <div className="section-heading reveal">
          <p className="kicker">Услуги</p>
          <h2 id="packages-title">Пакеты для разных этапов: от точечной ясности до проекта под ключ</h2>
        </div>
        <div className="package-grid">
          {packages.map((item, index) => (
            <article className="package-card reveal" key={item.name}>
              <div className="package-top">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{item.price}</p>
              </div>
              <h3>{item.name}</h3>
              <p>{item.text}</p>
              <ul>
                {item.items.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <a href="#consultation">Обсудить формат</a>
            </article>
          ))}
        </div>
      </section>

      <section className="section process" id="process" aria-labelledby="process-title">
        <div className="section-heading reveal">
          <p className="kicker">Процесс</p>
          <h2 id="process-title">Спокойный маршрут без хаоса и лишних решений</h2>
        </div>
        <ol className="process-list">
          {process.map((item, index) => (
            <li className="reveal" key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{item}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section expert section-grid" aria-labelledby="expert-title">
        <div className="expert-portrait reveal" aria-hidden="true">
          <span>V</span>
        </div>
        <div className="section-heading reveal">
          <p className="kicker">О эксперте</p>
          <h2 id="expert-title">Работа на стыке Васту, интерьерной логики и тонкого восприятия</h2>
          <p>
            Эксперт ведет проект как переводчик между древней системой и вашим
            реальным бытом. В рекомендациях нет случайной экзотики: только то,
            что можно внедрить эстетично, экологично и без конфликта с образом
            жизни.
          </p>
        </div>
      </section>

      <section className="section faq" id="faq" aria-labelledby="faq-title">
        <div className="section-heading reveal">
          <p className="kicker">FAQ</p>
          <h2 id="faq-title">Вопросы, которые лучше прояснить до начала</h2>
        </div>
        <div className="faq-list">
          {faq.map((item) => (
            <details className="reveal" key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section cta" id="consultation" aria-labelledby="cta-title">
        <div className="cta-copy reveal">
          <p className="kicker">Первый шаг</p>
          <h2 id="cta-title">Начните с короткой диагностики ощущения дома</h2>
          <p>
            Оставьте контакт, и мы согласуем формат: быстрый разбор, полная
            гармонизация или сопровождение проекта.
          </p>
        </div>
        <form
          className="contact-form reveal"
          aria-label="Заявка на консультацию"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
          }}
        >
          <label>
            <span>Имя</span>
            <input type="text" name="name" placeholder="Как к вам обращаться" required />
          </label>
          <label>
            <span>Контакт</span>
            <input type="text" name="contact" placeholder="Telegram или телефон" required />
          </label>
          <label>
            <span>Запрос</span>
            <textarea name="message" placeholder="Квартира, дом, кабинет или проект ремонта" />
          </label>
          <button className="button button-primary" type="submit">
            {submitted ? 'Заявка сохранена' : 'Отправить заявку'}
          </button>
          {submitted && (
            <p className="form-note" aria-live="polite">
              Форма готова к подключению CRM, Telegram-бота или почтового
              обработчика.
            </p>
          )}
        </form>
      </section>

      <footer className="footer">
        <p>Vastu Space / гармонизация пространства</p>
        <a href="#top">Наверх</a>
      </footer>
    </main>
  )
}

export default App
