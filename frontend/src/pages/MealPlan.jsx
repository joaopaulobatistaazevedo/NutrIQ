import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Sunrise, Sun, Moon } from 'lucide-react';
import Layout from '../components/Layout';
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

function getMealsByDate(date) {
  const breakfast = [
    'Overnight oats com banana e sementes',
    'Iogurte grego com granola e frutos vermelhos',
    'Pão integral com ovo mexido e queijo fresco',
  ];
  const lunch = [
    'Frango grelhado com arroz integral e legumes',
    'Bowl de quinoa com salmão e espinafres',
    'Massa integral com atum, tomate e rúcula',
  ];
  const dinner = [
    'Sopa de legumes e omelete de claras',
    'Pescada no forno com batata-doce',
    'Salada morna de grão com legumes assados',
  ];

  const idx = date.getDate();
  return [
    { slot: 'Pequeno-almoço', icon: Sunrise, time: '08:00', dish: breakfast[idx % breakfast.length], kcal: 380 },
    { slot: 'Almoço', icon: Sun, time: '13:00', dish: lunch[(idx + 1) % lunch.length], kcal: 620 },
    { slot: 'Jantar', icon: Moon, time: '20:00', dish: dinner[(idx + 2) % dinner.length], kcal: 540 },
  ];
}

export default function MealPlan() {
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

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

  const monthCells = useMemo(() => getMonthCells(monthCursor), [monthCursor]);
  const meals = useMemo(() => getMealsByDate(selectedDate), [selectedDate]);

  const goToPreviousMonth = () => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <Layout>
      <div className="meal-plan">
        <header className="meal-plan-header">
          <div>
            <h1 className="meal-plan-title">Calendário de Refeições</h1>
            <p className="meal-plan-subtitle">Organiza e acompanha o plano nutricional dia a dia</p>
          </div>
          <button className="btn-primary">
            <CalendarDays size={16} />
            <span>Gerar Semana</span>
          </button>
        </header>

        <section className="meal-plan-grid">
          <article className="calendar-card">
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

          <article className="daily-plan-card">
            <h2 className="daily-plan-title">{selectedLabel}</h2>
            <p className="daily-plan-subtitle">Plano diário recomendado</p>

            <div className="daily-meals">
              {meals.map((meal) => {
                const Icon = meal.icon;
                return (
                  <article key={meal.slot} className="daily-meal-item">
                    <div className="daily-meal-head">
                      <span className="daily-meal-slot">
                        <Icon size={16} />
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
    </Layout>
  );
}
