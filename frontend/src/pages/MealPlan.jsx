import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Sun } from 'lucide-react';
import Layout from '../components/Layout';
import { fetchActiveMealPlan } from '../services/mealPlanService';
import { CART_GENERATE_REQUEST_KEY, PROFILE_KEY, WEEKLY_PLAN_KEY } from '../constants/storageKeys';
import { resolveAccountId, scopedKey } from '../utils/accountScope';
import '../styles/meal-plan.css';

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

function toMondayIndex(day) {
  return (day + 6) % 7;
}

function isSameDate(first, second) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function getMonthCells(anchorDate) {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  const startOffset = toMondayIndex(firstDay.getDay());

  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}


function capitalize(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function slotMeta(slot) {
  if (slot === 'Snack') {
    return { icon: Sun, time: '16:30', kcal: 280 };
  }
  return { icon: null, time: '13:00', kcal: 620 };
}

export default function MealPlan() {
  const accountId = useMemo(() => {
    const profile = parseStorage(PROFILE_KEY, null);
    return resolveAccountId(profile);
  }, []);

  const navigate = useNavigate();

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [weeklyPlan, setWeeklyPlan] = useState(() => parseStorage(scopedKey(WEEKLY_PLAN_KEY, accountId), null));
  const [monthCursor, setMonthCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);

  const monthLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' });
    return capitalize(formatter.format(monthCursor));
  }, [monthCursor]);

  const selectedLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
    return capitalize(formatter.format(selectedDate));
  }, [selectedDate]);

  const selectedIso = useMemo(() => selectedDate.toISOString().slice(0, 10), [selectedDate]);
  const monthCells = useMemo(() => getMonthCells(monthCursor), [monthCursor]);

  const meals = useMemo(() => {
    const planDay = weeklyPlan?.days?.find((day) => day?.date === selectedIso);

    if (!planDay?.meals?.length) {
      return [];
    }

    return planDay.meals.map((meal) => {
      const meta = slotMeta(meal.slot);
      return {
        slot: meal.slot,
        icon: meta.icon,
        time: meta.time,
        dish: meal.title,
        kcal: Number.isFinite(Number(meal.kcal)) ? Number(meal.kcal) : meta.kcal,
      };
    });
  }, [selectedIso, weeklyPlan]);
  useEffect(() => {
    let cancelled = false;

    const storageKey = scopedKey(WEEKLY_PLAN_KEY, accountId);

    const syncPlan = async () => {
      const localPlan = parseStorage(storageKey, null);
      if (!cancelled) {
        setWeeklyPlan(localPlan);
      }

      try {
        const backendPlan = await fetchActiveMealPlan();
        if (!cancelled && backendPlan) {
          localStorage.setItem(storageKey, JSON.stringify(backendPlan));
          setWeeklyPlan(backendPlan);
        }
      } catch {
      }
    };

    const onPlanUpdate = (event) => {
      const payloadAccountId = event?.detail?.accountId;
      if (!payloadAccountId || payloadAccountId === accountId) {
        void syncPlan();
      }
    };

    const onStorageChange = (event) => {
      if (event.key === storageKey) {
        void syncPlan();
      }
    };

    void syncPlan();
    window.addEventListener('nutribot:weekly-plan-updated', onPlanUpdate);
    window.addEventListener('storage', onStorageChange);

    return () => {
      cancelled = true;
      window.removeEventListener('nutribot:weekly-plan-updated', onPlanUpdate);
      window.removeEventListener('storage', onStorageChange);
    };
  }, [accountId]);


  const handleGenerateCart = () => {
    localStorage.setItem(CART_GENERATE_REQUEST_KEY, String(Date.now()));
    window.dispatchEvent(new CustomEvent('nutribot:generate-cart-request', { detail: { accountId } }));
    navigate('/shopping');
  };

  const goToPreviousMonth = () => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <Layout>
      <div className="page">
        <div className="container-xl">
          <div className="meal-plan">
            <header className="meal-plan-header page-header d-print-none">
              <div>
                <h1 className="meal-plan-title page-title">Calendário de Refeições</h1>
                <p className="meal-plan-subtitle text-secondary mb-0">Organiza e acompanha o plano nutricional dia a dia</p>
              </div>
              <button className="btn btn-primary d-inline-flex align-items-center gap-2" type="button" onClick={handleGenerateCart}>
                <CalendarDays size={16} />
                <span>Gerar carrinho</span>
              </button>
            </header>

            <section className="meal-plan-grid">
              <article className="calendar-card card">
                <div className="calendar-toolbar">
                  <button type="button" className="calendar-nav-btn" onClick={goToPreviousMonth} aria-label="Mês anterior">
                    <ChevronLeft size={16} />
                  </button>

                  <h2>{monthLabel}</h2>

                  <button type="button" className="calendar-nav-btn" onClick={goToNextMonth} aria-label="Mês seguinte">
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="calendar-week-row" role="presentation">
                  {WEEK_DAYS.map((day) => (
                    <span key={day} className="calendar-week-day">
                      {day}
                    </span>
                  ))}
                </div>

                <div className="calendar-days-grid" role="grid" aria-label={`Dias de ${monthLabel}`}>
                  {monthCells.map((date, index) => {
                    if (!date) {
                      return <span key={`empty-${index}`} className="calendar-empty-cell" aria-hidden="true" />;
                    }

                    const isToday = isSameDate(date, today);
                    const isSelected = isSameDate(date, selectedDate);

                    return (
                      <button
                        key={date.toISOString()}
                        type="button"
                        className={`calendar-day-btn ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedDate(date)}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              </article>

              <article className="daily-plan-card card">
                <h2 className="daily-plan-title">{selectedLabel}</h2>
                <p className="daily-plan-subtitle">Plano diário recomendado</p>

                <div className="daily-meals">
                  {!meals.length ? (
                    <p className="daily-meals-empty">
                      Ainda não tens refeições planeadas. Fala com o chatbot para criares o teu plano!
                    </p>
                  ) : null}

                  {meals.map((meal) => {
                    const Icon = meal.icon;
                    return (
                      <article key={`${selectedIso}-${meal.slot}-${meal.dish}`} className="daily-meal-item">
                        <div className="daily-meal-head">
                          <span className="daily-meal-slot">
                            {Icon ? <Icon size={16} /> : null}
                            {meal.slot}
                          </span>
                          <span className="daily-meal-time">
                            <Clock3 size={14} />
                            {meal.time}
                          </span>
                        </div>

                        <h3>{meal.dish}</h3>
                        <p>{meal.kcal} kcal</p>
                      </article>
                    );
                  })}
                </div>
              </article>
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
}
