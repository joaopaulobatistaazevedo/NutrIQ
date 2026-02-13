import { useMemo, useState } from 'react';
import { CheckSquare, Circle, Minus, Plus, ShoppingCart, Store, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import '../styles/shopping.css';

const INITIAL_LISTS = {
  pingo_doce: {
    name: 'Pingo Doce',
    items: [
      {
        id: 'pd-1',
        name: 'Papel Higiénico Compacto 6 Rolos',
        unitInfo: '6 UN | 0,40 €/UN',
        unitPrice: 2.39,
        discount: 0,
        quantity: 1,
        checked: false,
      },
      {
        id: 'pd-2',
        name: 'Iogurte Grego Natural',
        unitInfo: '4 UN | 0,65 €/UN',
        unitPrice: 2.6,
        discount: 0.4,
        quantity: 2,
        checked: false,
      },
    ],
  },
  continente: {
    name: 'Continente',
    items: [
      {
        id: 'ct-1',
        name: 'Peito de Frango (bandeja)',
        unitInfo: '800 g | 8,20 €/kg',
        unitPrice: 6.56,
        discount: 0.5,
        quantity: 1,
        checked: false,
      },
      {
        id: 'ct-2',
        name: 'Massa Integral Fusilli',
        unitInfo: '500 g | 1,58 €/UN',
        unitPrice: 1.58,
        discount: 0,
        quantity: 2,
        checked: true,
      },
    ],
  },
  lidl: {
    name: 'Lidl',
    items: [
      {
        id: 'ld-1',
        name: 'Arroz Basmati',
        unitInfo: '1 kg | 2,49 €/UN',
        unitPrice: 2.49,
        discount: 0.3,
        quantity: 1,
        checked: false,
      },
      {
        id: 'ld-2',
        name: 'Atum em Água',
        unitInfo: '4 Latas | 0,90 €/UN',
        unitPrice: 3.6,
        discount: 0,
        quantity: 1,
        checked: false,
      },
    ],
  },
};

const SUGGESTED_ITEMS = [
  { name: 'Banana (1kg)', unitInfo: '1 kg | 1,39 €/UN', unitPrice: 1.39 },
  { name: 'Aveia Integral', unitInfo: '500 g | 1,89 €/UN', unitPrice: 1.89 },
  { name: 'Leite magro', unitInfo: '1 L | 0,89 €/UN', unitPrice: 0.89 },
];

function formatCurrency(value) {
  return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

function getCardAccent(storeKey) {
  if (storeKey === 'pingo_doce') return 'is-pingo';
  if (storeKey === 'continente') return 'is-continente';
  return 'is-lidl';
}

export default function Shopping() {
  const [lists, setLists] = useState(INITIAL_LISTS);
  const [activeListId, setActiveListId] = useState('pingo_doce');

  const activeList = lists[activeListId];
  const activeItems = activeList.items;

  const updateItem = (itemId, updater) => {
    setLists((previous) => ({
      ...previous,
      [activeListId]: {
        ...previous[activeListId],
        items: previous[activeListId].items.map((item) => (item.id === itemId ? updater(item) : item)),
      },
    }));
  };

  const removeItem = (itemId) => {
    setLists((previous) => ({
      ...previous,
      [activeListId]: {
        ...previous[activeListId],
        items: previous[activeListId].items.filter((item) => item.id !== itemId),
      },
    }));
  };

  const addSuggestedItem = (suggestion) => {
    setLists((previous) => ({
      ...previous,
      [activeListId]: {
        ...previous[activeListId],
        items: [
          ...previous[activeListId].items,
          {
            id: `${activeListId}-${Date.now()}`,
            name: suggestion.name,
            unitInfo: suggestion.unitInfo,
            unitPrice: suggestion.unitPrice,
            discount: 0,
            quantity: 1,
            checked: false,
          },
        ],
      },
    }));
  };

  const summary = useMemo(() => {
    const subtotal = activeItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
    const savings = activeItems.reduce((total, item) => total + item.discount * item.quantity, 0);
    const checkedItems = activeItems.filter((item) => item.checked).length;
    const totalUnits = activeItems.reduce((total, item) => total + item.quantity, 0);
    return { subtotal, savings, checkedItems, totalUnits };
  }, [activeItems]);

  return (
    <Layout>
      <div className="shopping-page">
        <header className="shopping-header">
          <div>
            <h1>Lista de Compras</h1>
            <p>Organiza por loja, ajusta quantidades e acompanha o total em tempo real.</p>
          </div>
          <div className="shopping-header-tag">
            <ShoppingCart size={16} />
            Lista do dia
          </div>
        </header>

        <div className="shopping-grid">
          <section className="shopping-lists-panel">
            <h2>Listas por supermercado</h2>

            <div className="shopping-list-switchers">
              {Object.entries(lists).map(([key, list]) => (
                <button
                  key={key}
                  type="button"
                  className={`shopping-list-pill ${key === activeListId ? 'is-active' : ''}`}
                  onClick={() => setActiveListId(key)}
                >
                  <Store size={14} />
                  <span>{list.name}</span>
                  <strong>{list.items.length}</strong>
                </button>
              ))}
            </div>

            <div className="shopping-suggestions">
              <h3>Adicionar rápido</h3>
              <div className="shopping-suggestion-items">
                {SUGGESTED_ITEMS.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className="suggestion-chip"
                    onClick={() => addSuggestedItem(item)}
                  >
                    + {item.name}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="shopping-cart-panel">
            <header className="shopping-cart-header">
              <h2>O meu carrinho ({activeItems.length})</h2>
              <p>
                {summary.checkedItems} / {activeItems.length} itens concluídos
              </p>
            </header>

            <div className="shopping-items">
              {activeItems.map((item) => (
                <article key={item.id} className={`shopping-item ${getCardAccent(activeListId)}`}>
                  <div className="shopping-item-image" aria-hidden="true">
                    <span>{item.name.charAt(0)}</span>
                  </div>

                  <div className="shopping-item-content">
                    <div className="shopping-item-top">
                      <div>
                        <h3>{item.name}</h3>
                        <p>{activeList.name}</p>
                        <small>{item.unitInfo}</small>
                      </div>

                      <button type="button" className="trash-btn" onClick={() => removeItem(item.id)} aria-label="Remover item">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="shopping-item-bottom">
                      <div className="qty-control">
                        <button
                          type="button"
                          onClick={() => updateItem(item.id, (prev) => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
                          aria-label="Diminuir quantidade"
                        >
                          <Minus size={15} />
                        </button>
                        <span>{item.quantity} un</span>
                        <button
                          type="button"
                          onClick={() => updateItem(item.id, (prev) => ({ ...prev, quantity: prev.quantity + 1 }))}
                          aria-label="Aumentar quantidade"
                        >
                          <Plus size={15} />
                        </button>
                      </div>

                      <button
                        type="button"
                        className={`check-btn ${item.checked ? 'is-checked' : ''}`}
                        onClick={() => updateItem(item.id, (prev) => ({ ...prev, checked: !prev.checked }))}
                      >
                        {item.checked ? <CheckSquare size={16} /> : <Circle size={16} />}
                        <span>{item.checked ? 'Concluído' : 'Marcar'}</span>
                      </button>

                      <strong className="line-total">{formatCurrency(item.unitPrice * item.quantity)}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <footer className="shopping-summary">
              <div className="summary-row">
                <span>Poupança</span>
                <strong className="saving">{formatCurrency(summary.savings)}</strong>
              </div>
              <div className="summary-row">
                <span>Subtotal ({summary.totalUnits} un)</span>
                <strong>{formatCurrency(summary.subtotal)}</strong>
              </div>

              <button type="button" className="checkout-btn">
                Avançar para checkout
              </button>
              <p className="checkout-note">
                Algumas promoções podem ser aplicadas apenas no checkout final.
              </p>
            </footer>
          </section>
        </div>
      </div>
    </Layout>
  );
}
