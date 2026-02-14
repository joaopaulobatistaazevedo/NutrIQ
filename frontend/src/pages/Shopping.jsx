import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Circle, Minus, Plus, ShoppingCart, Store, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import {
  getCheapestIngredientPrice,
  importPriceReport,
  listIngredientPrices,
  listLatestPrices,
} from '../services/priceService';
import '../styles/shopping.css';

const CARD_ACCENTS = ['is-pingo', 'is-continente', 'is-lidl'];
const EMPTY_ITEMS = [];

function formatCurrency(value, currency = 'EUR') {
  return Number(value || 0).toLocaleString('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
  });
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizePriceItem(entry, index) {
  const ingredientName = String(
    entry?.ingredientName || entry?.ingredientNormalized || 'Ingrediente',
  ).trim();
  const productName = String(entry?.productName || ingredientName).trim();
  const market = String(entry?.supermarket || 'Supermercado').trim();
  const safeIngredient = slugify(entry?.ingredientNormalized || ingredientName) || 'ingrediente';

  return {
    id: `${slugify(market) || 'market'}-${safeIngredient}-${index}`,
    ingredientName,
    name: productName,
    unitInfo:
      String(entry?.note || '').trim() ||
      (entry?.source ? `fonte: ${entry.source}` : 'preço importado'),
    unitPrice: Number(entry?.price || 0),
    discount: 0,
    quantity: 1,
    checked: false,
    currency: String(entry?.currency || 'EUR').trim() || 'EUR',
    productUrl: String(entry?.productUrl || '').trim(),
    imageUrl: String(entry?.imageUrl || entry?.image_url || '').trim(),
  };
}

function buildListsFromPrices(prices) {
  const lists = {};
  let colorIndex = 0;

  prices.forEach((entry, index) => {
    const market = String(entry?.supermarket || 'Supermercado').trim() || 'Supermercado';
    const key = slugify(market) || `market_${colorIndex}`;

    if (!lists[key]) {
      lists[key] = {
        name: market,
        accentClass: CARD_ACCENTS[colorIndex % CARD_ACCENTS.length],
        items: [],
      };
      colorIndex += 1;
    }

    lists[key].items.push(normalizePriceItem(entry, index));
  });

  Object.values(lists).forEach((list) => {
    list.items.sort((left, right) => left.ingredientName.localeCompare(right.ingredientName, 'pt'));
  });

  return lists;
}

function normalizeCheapestResult(entry) {
  if (!entry) {
    return null;
  }

  const ingredientName = String(
    entry?.ingredientName || entry?.ingredientNormalized || 'Ingrediente',
  ).trim();
  const market = String(entry?.supermarket || 'Supermercado').trim() || 'Supermercado';
  const safeIngredient = slugify(entry?.ingredientNormalized || ingredientName) || 'ingrediente';

  return {
    id: `cheapest-${safeIngredient}-${Date.now()}`,
    ingredientName,
    name: String(entry?.productName || ingredientName).trim(),
    unitInfo:
      String(entry?.note || '').trim() ||
      (entry?.source ? `fonte: ${entry.source}` : 'preço importado'),
    unitPrice: Number(entry?.price || 0),
    discount: 0,
    quantity: 1,
    checked: false,
    currency: String(entry?.currency || 'EUR').trim() || 'EUR',
    productUrl: String(entry?.productUrl || '').trim(),
    imageUrl: String(entry?.imageUrl || entry?.image_url || '').trim(),
    supermarket: market,
  };
}

function itemImageFor(item) {
  const imageUrl = String(item?.imageUrl || '').trim();
  if (imageUrl) {
    return imageUrl;
  }
  const seed = encodeURIComponent(String(item?.name || '').toLowerCase().replace(/\s+/g, '-'));
  return `https://picsum.photos/seed/${seed}/300/300`;
}

export default function Shopping() {
  const [lists, setLists] = useState({});
  const [activeListId, setActiveListId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [cheapestResult, setCheapestResult] = useState(null);
  const [ingredientMatches, setIngredientMatches] = useState(EMPTY_ITEMS);
  const [importPayload, setImportPayload] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  const loadPrices = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const prices = await listLatestPrices();
      const nextLists = buildListsFromPrices(prices);
      const firstListId = Object.keys(nextLists)[0] || '';
      setLists(nextLists);
      setActiveListId((previous) => (previous && nextLists[previous] ? previous : firstListId));
    } catch (error) {
      setLoadError(error.message || 'Não foi possível carregar os preços.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrices();
  }, [loadPrices]);

  const activeList = activeListId ? lists[activeListId] : null;
  const activeItems = activeList?.items || EMPTY_ITEMS;

  const updateItem = (itemId, updater) => {
    if (!activeListId) {
      return;
    }

    setLists((previous) => {
      const currentList = previous[activeListId];
      if (!currentList) {
        return previous;
      }

      return {
        ...previous,
        [activeListId]: {
          ...currentList,
          items: currentList.items.map((item) => (item.id === itemId ? updater(item) : item)),
        },
      };
    });
  };

  const removeItem = (itemId) => {
    if (!activeListId) {
      return;
    }

    setLists((previous) => {
      const currentList = previous[activeListId];
      if (!currentList) {
        return previous;
      }

      return {
        ...previous,
        [activeListId]: {
          ...currentList,
          items: currentList.items.filter((item) => item.id !== itemId),
        },
      };
    });
  };

  const addItemToActiveList = (item) => {
    if (!item || !activeListId) {
      return;
    }

    setLists((previous) => {
      const currentList = previous[activeListId];
      if (!currentList) {
        return previous;
      }

      return {
        ...previous,
        [activeListId]: {
          ...currentList,
          items: [
            ...currentList.items,
            {
              ...item,
              id: `${activeListId}-${Date.now()}`,
              quantity: 1,
              checked: false,
            },
          ],
        },
      };
    });
  };

  const searchCheapestIngredient = async (event) => {
    event.preventDefault();
    const cleanedQuery = String(ingredientQuery || '').trim();
    setCheapestResult(null);
    setIngredientMatches(EMPTY_ITEMS);
    setQueryError('');

    if (!cleanedQuery) {
      setQueryError('Escreve um ingrediente para pesquisar.');
      return;
    }

    setIsSearching(true);
    try {
      const [cheapestResponse, matches] = await Promise.all([
        getCheapestIngredientPrice(cleanedQuery),
        listIngredientPrices(cleanedQuery),
      ]);
      setCheapestResult(normalizeCheapestResult(cheapestResponse));
      setIngredientMatches(Array.isArray(matches) ? matches.slice(0, 6) : EMPTY_ITEMS);
    } catch (error) {
      setQueryError(error.message || 'Não foi possível pesquisar o ingrediente.');
    } finally {
      setIsSearching(false);
    }
  };

  const importReportPayload = async (event) => {
    event.preventDefault();
    const cleanedPayload = String(importPayload || '').trim();
    setImportStatus('');

    if (!cleanedPayload) {
      setImportStatus('Cola aqui o JSON do report antes de importar.');
      return;
    }

    setIsImporting(true);
    try {
      const response = await importPriceReport(cleanedPayload);
      await loadPrices();
      const imported = Number(response?.importedEntries || 0);
      const deduped = Number(response?.dedupedEntries || 0);
      setImportStatus(`Importação concluída: ${imported} gravados (${deduped} deduplicados).`);
      setImportPayload('');
    } catch (error) {
      setImportStatus(error.message || 'Falha ao importar report.');
    } finally {
      setIsImporting(false);
    }
  };

  const summary = useMemo(() => {
    const subtotal = activeItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
    const checkedItems = activeItems.filter((item) => item.checked).length;
    const totalUnits = activeItems.reduce((total, item) => total + item.quantity, 0);
    const currency = activeItems[0]?.currency || 'EUR';
    return {
      subtotal,
      checkedItems,
      totalUnits,
      currency,
    };
  }, [activeItems]);

  const marketEntries = Object.entries(lists);
  const hasData = marketEntries.length > 0;

  return (
    <Layout>
      <div className="shopping-page">
        <PageHeader
          className="shopping-header"
          title="Lista de Compras"
          subtitle="Dados reais importados do scraper, organizados por supermercado."
          tag={(
            <div className="shopping-header-tag">
              <ShoppingCart size={16} />
              Preços atuais
            </div>
          )}
        />

        <div className="shopping-grid">
          <section className="shopping-lists-panel">
            <h2>Listas por supermercado</h2>

            {isLoading ? (
              <p className="shopping-feedback">A carregar preços...</p>
            ) : loadError ? (
              <p className="shopping-feedback shopping-feedback-error">{loadError}</p>
            ) : !hasData ? (
              <p className="shopping-feedback">
                Não existem preços importados. Corre o scraper e faz import para o backend.
              </p>
            ) : (
              <div className="shopping-list-switchers">
                {marketEntries.map(([key, list]) => (
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
            )}

            <div className="shopping-suggestions">
              <h3>Buscar ingrediente mais barato</h3>
              <form className="shopping-search-form" onSubmit={searchCheapestIngredient}>
                <input
                  type="text"
                  placeholder="Ex: ovos, azeite, massa"
                  value={ingredientQuery}
                  onChange={(event) => setIngredientQuery(event.target.value)}
                />
                <button type="submit" className="suggestion-chip" disabled={isSearching}>
                  {isSearching ? 'A pesquisar...' : 'Pesquisar'}
                </button>
              </form>

              {queryError ? <p className="shopping-feedback shopping-feedback-error">{queryError}</p> : null}

              {cheapestResult ? (
                <article className="shopping-cheapest-card">
                  <h4>{cheapestResult.name}</h4>
                  <p>{cheapestResult.supermarket}</p>
                  <strong>{formatCurrency(cheapestResult.unitPrice, cheapestResult.currency)}</strong>
                  <div className="shopping-cheapest-actions">
                    <button
                      type="button"
                      className="suggestion-chip"
                      onClick={() => addItemToActiveList(cheapestResult)}
                      disabled={!activeListId}
                    >
                      + Adicionar à lista
                    </button>
                    {cheapestResult.productUrl ? (
                      <a href={cheapestResult.productUrl} target="_blank" rel="noreferrer">
                        Ver produto
                      </a>
                    ) : null}
                  </div>

                  {ingredientMatches.length ? (
                    <div className="shopping-cheapest-matches">
                      {ingredientMatches.map((match) => (
                        <span key={`${match.supermarket}-${match.productName}-${match.price}`}>
                          {match.supermarket}: {formatCurrency(match.price, match.currency)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ) : null}
            </div>

            <div className="shopping-import-panel">
              <h3>Importar report.json</h3>
              <form className="shopping-import-form" onSubmit={importReportPayload}>
                <textarea
                  value={importPayload}
                  onChange={(event) => setImportPayload(event.target.value)}
                  placeholder="Cola aqui o JSON do report do scraper..."
                />
                <button type="submit" className="suggestion-chip" disabled={isImporting}>
                  {isImporting ? 'A importar...' : 'Importar para backend'}
                </button>
              </form>
              {importStatus ? <p className="shopping-feedback">{importStatus}</p> : null}
            </div>
          </section>

          <section className="shopping-cart-panel">
            <header className="shopping-cart-header">
              <h2>
                {activeList?.name ? `Carrinho - ${activeList.name}` : 'Carrinho'}
                {' '}
                ({activeItems.length})
              </h2>
              <p>
                {summary.checkedItems} / {activeItems.length} itens concluídos
              </p>
            </header>

            <div className="shopping-items">
              {!activeList && !isLoading ? (
                <p className="shopping-feedback">Seleciona um supermercado para ver os produtos.</p>
              ) : null}

              {activeItems.map((item) => (
                <article key={item.id} className={`shopping-item ${activeList.accentClass}`}>
                  <div className="shopping-item-image" aria-hidden="true">
                    <img src={itemImageFor(item)} alt={item.name} loading="lazy" />
                  </div>

                  <div className="shopping-item-content">
                    <div className="shopping-item-top">
                      <div>
                        <h3>{item.name}</h3>
                        <p>{activeList.name}</p>
                        <small>{item.ingredientName}</small>
                        {item.productUrl ? (
                          <a
                            className="shopping-item-link"
                            href={item.productUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver produto
                          </a>
                        ) : null}
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

                      <strong className="line-total">
                        {formatCurrency(item.unitPrice * item.quantity, item.currency)}
                      </strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <footer className="shopping-summary">
              <div className="summary-row">
                <span>Poupança</span>
                <strong className="saving">{formatCurrency(0, summary.currency)}</strong>
              </div>
              <div className="summary-row">
                <span>Subtotal ({summary.totalUnits} un)</span>
                <strong>{formatCurrency(summary.subtotal, summary.currency)}</strong>
              </div>

              <button type="button" className="checkout-btn" disabled={!activeItems.length}>
                Avançar para checkout
              </button>
              <p className="checkout-note">
                Esta lista usa os últimos preços importados em `/api/prices`.
              </p>
            </footer>
          </section>
        </div>
      </div>
    </Layout>
  );
}
