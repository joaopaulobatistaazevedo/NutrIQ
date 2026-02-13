import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Euro, Flame, Layers } from 'lucide-react';
import Layout from '../components/Layout';
import '../styles/recipes.css';

const RECIPE_CATEGORIES = [
  {
    id: 'massa',
    title: 'Base: Massa',
    description: 'Receitas com a mesma base de massa, ideais para rodar durante a semana.',
    recipes: [
      { name: 'Massa Carbonara Fit', time: '20 min', kcal: 620, price: '€3.80' },
      { name: 'Massa Bolonhesa de Peru', time: '25 min', kcal: 590, price: '€4.10' },
      { name: 'Massa com Atum e Espinafres', time: '18 min', kcal: 540, price: '€3.20' },
      { name: 'Massa Cremosa de Frango', time: '24 min', kcal: 610, price: '€4.40' },
    ],
  },
  {
    id: 'arroz',
    title: 'Base: Arroz',
    description: 'Combinações simples com arroz para almoço e jantar equilibrados.',
    recipes: [
      { name: 'Arroz de Frango e Legumes', time: '28 min', kcal: 600, price: '€4.50' },
      { name: 'Arroz de Salmão e Brócolos', time: '22 min', kcal: 640, price: '€5.90' },
      { name: 'Bowl de Arroz com Tofu', time: '20 min', kcal: 520, price: '€3.90' },
      { name: 'Arroz de Peru com Feijão', time: '26 min', kcal: 610, price: '€4.20' },
    ],
  },
  {
    id: 'wraps',
    title: 'Base: Wrap / Tortilha',
    description: 'Receitas rápidas para dias de pouco tempo, mantendo proteína alta.',
    recipes: [
      { name: 'Wrap de Frango e Iogurte', time: '12 min', kcal: 470, price: '€3.10' },
      { name: 'Wrap de Atum Mediterrânico', time: '10 min', kcal: 450, price: '€2.90' },
      { name: 'Wrap de Ovos e Abacate', time: '11 min', kcal: 430, price: '€2.70' },
      { name: 'Wrap de Húmus e Grão', time: '9 min', kcal: 390, price: '€2.50' },
    ],
  },
];

function CategoryCarousel({ category }) {
  const trackRef = useRef(null);

  const scrollByAmount = (direction) => {
    const element = trackRef.current;
    if (!element) return;

    const card = element.querySelector('.recipe-card');
    const styles = window.getComputedStyle(element);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '0');
    const width = card ? card.getBoundingClientRect().width + gap : 420;
    element.scrollBy({ left: direction * width, behavior: 'smooth' });
  };

  const handleWheel = (event) => {
    const element = trackRef.current;
    if (!element) return;

    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      element.scrollBy({ left: event.deltaY, behavior: 'auto' });
    }
  };

  return (
    <section className="recipes-category">
      <header className="recipes-category-header">
        <div>
          <h2>{category.title}</h2>
          <p>{category.description}</p>
        </div>

        <div className="recipes-carousel-controls">
          <button type="button" className="recipes-control-btn" onClick={() => scrollByAmount(-1)} aria-label="Anterior">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="recipes-control-btn" onClick={() => scrollByAmount(1)} aria-label="Seguinte">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="recipes-carousel-track" ref={trackRef} onWheel={handleWheel}>
        {category.recipes.map((recipe) => (
          <article key={recipe.name} className="recipe-card">
            <p className="recipe-badge">
              <Layers size={13} />
              {category.title}
            </p>
            <h3>{recipe.name}</h3>

            <div className="recipe-meta">
              <span>
                <Clock3 size={14} />
                {recipe.time}
              </span>
              <span>
                <Flame size={14} />
                {recipe.kcal} kcal
              </span>
              <span>
                <Euro size={14} />
                {recipe.price}
              </span>
            </div>

            <button type="button" className="recipe-open-btn">
              Ver receita
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Recipes() {
  return (
    <Layout>
      <div className="recipes-page">
        <header className="recipes-header">
          <div>
            <h1>Receitas por Base</h1>
            <p>
              Organização por categoria para veres receitas parecidas juntas
              como pediste (ex: carbonara e bolonhesa na base massa).
            </p>
          </div>
        </header>

        <div className="recipes-categories">
          {RECIPE_CATEGORIES.map((category) => (
            <CategoryCarousel key={category.id} category={category} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
