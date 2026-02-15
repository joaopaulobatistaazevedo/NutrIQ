import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, Circle, Minus, Plus, ShoppingCart, Store, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { fetchRecipeById } from '../services/recipeService';
import {
  getCheapestIngredientPrice,
  listIngredientPrices,
  listLatestPrices,
} from '../services/priceService';
import { generateShoppingCartFromMealPlan } from '../services/chatbotService';
import { fetchPersistedShoppingCart, savePersistedShoppingCart } from '../services/shoppingCartService';
import { PROFILE_KEY, WEEKLY_PLAN_KEY, CART_GENERATE_REQUEST_KEY } from '../constants/storageKeys';
import { resolveAccountId, scopedKey } from '../utils/accountScope';
import '../styles/shopping.css';

const CARD_ACCENTS = ['is-pingo', 'is-continente', 'is-lidl'];
const EMPTY_ITEMS = [];

const MARKET_CHECKOUT_RULES = [
  {
    key: 'continente',
    matches: ['continente'],
    checkoutUrl: 'https://www.continente.pt/checkout',
    addToCartUrl: (productId, quantity) => (
      `https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/Cart-AddProduct?pid=${encodeURIComponent(productId)}&quantity=${Math.max(1, Number(quantity || 1))}`
    ),
  },
  {
    key: 'auchan',
    matches: ['auchan'],
    checkoutUrl: 'https://www.auchan.pt/pt/checkout-begin',
    addToCartUrl: (productId, quantity) => (
      `https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Cart-AddProduct?pid=${encodeURIComponent(productId)}&quantity=${Math.max(1, Number(quantity || 1))}`
    ),
  },
  {
    key: 'pingo-doce',
    matches: ['pingo doce', 'pingodoce'],
    checkoutUrl: 'https://www.pingodoce.pt/checkout',
    addToCartUrl: (productId, quantity) => (
      `https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/default/Cart-AddProduct?pid=${encodeURIComponent(productId)}&quantity=${Math.max(1, Number(quantity || 1))}`
    ),
  },
  {
    key: 'lidl',
    matches: ['lidl'],
    checkoutUrl: 'https://www.lidl.pt',
    addToCartUrl: null,
  },
];

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


function normalizeMarketName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveMarketCheckoutRule(marketName) {
  const normalized = normalizeMarketName(marketName);
  if (!normalized) return null;
  return (
    MARKET_CHECKOUT_RULES.find((rule) => rule.matches.some((token) => normalized.includes(token)))
    || null
  );
}

function extractProductIdFromUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';

  const parsedFromQuery = value.match(/[?&](?:pid|product_id|productId)=([^&#]+)/i);
  if (parsedFromQuery?.[1]) {
    return decodeURIComponent(parsedFromQuery[1]).trim();
  }

  const pathname = value.split('?')[0] || '';
  const allNumericMatches = pathname.match(/(\d{5,})/g);
  if (Array.isArray(allNumericMatches) && allNumericMatches.length > 0) {
    return String(allNumericMatches[allNumericMatches.length - 1] || '').trim();
  }

  return '';
}

function buildMarketCheckoutPlan(marketName, items) {
  const checkoutRule = resolveMarketCheckoutRule(marketName);
  const checkoutUrl = checkoutRule?.checkoutUrl || '';
  const addToCartUrls = [];
  const fallbackProductUrls = [];
  let unresolvedCount = 0;

  (Array.isArray(items) ? items : []).forEach((item) => {
    const productUrl = String(item?.productUrl || '').trim();
    if (!productUrl) {
      unresolvedCount += 1;
      return;
    }

    const productId = extractProductIdFromUrl(productUrl);
    if (checkoutRule?.addToCartUrl && productId) {
      addToCartUrls.push(checkoutRule.addToCartUrl(productId, item?.quantity));
      return;
    }

    fallbackProductUrls.push(productUrl);
  });

  return {
    checkoutUrl,
    addToCartUrls,
    fallbackProductUrls,
    unresolvedCount,
  };
}

function normalizeIngredientKey(value) {
  return slugify(value || '').replace(/_/g, ' ').trim();
}

function cleanIngredientLabel(rawValue) {
  let value = String(rawValue || '').trim();
  if (!value) return '';

  value = value.replace(/\([^)]*\)/g, ' ');
  value = value.replace(/q\.?b\.?/gi, ' ');
  value = value.replace(/^[-\u2022*\s]+/, '');
  value = value.replace(
    /^\s*(?:\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*(?:(?:kg|g|gr|gramas?|ml|l|dl|cl|un|unid(?:ade)?s?|dentes?|colher(?:es)?(?:\s+de\s+(?:sopa|cha|chá))?|chávenas?|xícaras?|xicaras?)\b)?\s*/i,
    '',
  );
  value = value.replace(/\s+/g, ' ').trim();
  value = value.replace(/^[,.;:-]+|[,.;:-]+$/g, '').trim();
  return value;
}

function extractDemandFromRecipes(recipes) {
  const demand = new Map();

  recipes.forEach((recipe) => {
    const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
    ingredients.forEach((ingredient) => {
      const ingredientName = cleanIngredientLabel(ingredient?.ingredientName);
      if (!ingredientName) return;

      const key = normalizeIngredientKey(ingredientName);
      if (!key) return;

      const quantityRaw = Number(ingredient?.quantity);
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;
      const current = demand.get(key) || { ingredientName, quantity: 0 };

      demand.set(key, {
        ingredientName: current.ingredientName,
        quantity: current.quantity + quantity,
      });
    });
  });

  return demand;
}

function extractDemandFromRecipeDescriptions(recipes) {
  const demand = new Map();

  recipes.forEach((recipe) => {
    const description = String(recipe?.description || '').trim();
    if (!description) return;

    const match = description.match(/\bingredientes?\s*:\s*(.+)$/i);
    if (!match) return;

    const chunk = String(match[1] || '').split('|')[0].trim();
    if (!chunk) return;

    chunk.split(/[;,]/).forEach((token) => {
      const ingredientName = cleanIngredientLabel(token);
      if (!ingredientName) return;
      const key = normalizeIngredientKey(ingredientName);
      if (!key) return;

      const current = demand.get(key) || { ingredientName, quantity: 0 };
      demand.set(key, {
        ingredientName: current.ingredientName,
        quantity: current.quantity + 1,
      });
    });
  });

  return demand;
}

function extractDemandFromPlanPreview(plan) {
  const demand = new Map();
  const days = Array.isArray(plan?.days) ? plan.days : [];

  days.forEach((day) => {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    meals.forEach((meal) => {
      const preview = Array.isArray(meal?.ingredients_preview) ? meal.ingredients_preview : [];
      preview.forEach((rawValue) => {
        const ingredientName = cleanIngredientLabel(rawValue);
        if (!ingredientName) return;
        const key = normalizeIngredientKey(ingredientName);
        if (!key) return;

        const current = demand.get(key) || { ingredientName, quantity: 0 };
        demand.set(key, {
          ingredientName: current.ingredientName,
          quantity: current.quantity + 1,
        });
      });
    });
  });

  return demand;
}

function mergeDemandMaps(...maps) {
  const merged = new Map();

  maps.forEach((map) => {
    if (!(map instanceof Map)) return;
    map.forEach((value, key) => {
      if (!key || !value) return;
      const previous = merged.get(key) || {
        ingredientName: value.ingredientName || key,
        quantity: 0,
      };
      merged.set(key, {
        ingredientName: previous.ingredientName,
        quantity: Number(previous.quantity || 0) + Number(value.quantity || 0),
      });
    });
  });

  return merged;
}

function buildGeneratedLists(prices, ingredientDemand) {
  const bestByMarket = new Map();

  prices.forEach((entry) => {
    const marketName = String(entry?.supermarket || '').trim();
    if (!marketName) return;

    const ingredientKey = normalizeIngredientKey(
      String(entry?.ingredientNormalized || entry?.ingredientName || '').trim(),
    );
    if (!ingredientKey || !ingredientDemand.has(ingredientKey)) return;

    const price = Number(entry?.price);
    if (!Number.isFinite(price) || price <= 0) return;

    if (!bestByMarket.has(marketName)) {
      bestByMarket.set(marketName, new Map());
    }

    const marketMap = bestByMarket.get(marketName);
    const previous = marketMap.get(ingredientKey);
    if (!previous || price < Number(previous.price || 0)) {
      marketMap.set(ingredientKey, entry);
    }
  });

  const marketEntries = Array.from(bestByMarket.entries());
  const demandKeys = Array.from(ingredientDemand.keys());

  const lists = {};
  const comparison = [];
  let bestMarketKey = '';
  let bestMarketTotal = Number.POSITIVE_INFINITY;
  let colorIndex = 0;

  marketEntries.forEach(([marketName, marketMap]) => {
    let subtotal = 0;
    let coveredIngredients = 0;

    const items = demandKeys
      .map((ingredientKey, index) => {
        const found = marketMap.get(ingredientKey);
        if (!found) return null;

        coveredIngredients += 1;
        const normalized = normalizePriceItem(found, index);
        const demand = ingredientDemand.get(ingredientKey);
        const quantity = Math.max(1, Math.ceil(Number(demand?.quantity || 1)));
        subtotal += normalized.unitPrice * quantity;

        return {
          ...normalized,
          ingredientName: demand?.ingredientName || normalized.ingredientName,
          quantity,
        };
      })
      .filter(Boolean);

    const marketKey = slugify(marketName) || `market_${colorIndex}`;
    lists[marketKey] = {
      name: marketName,
      accentClass: CARD_ACCENTS[colorIndex % CARD_ACCENTS.length],
      items,
    };

    comparison.push({
      marketKey,
      supermarket: marketName,
      total: subtotal,
      missingCount: Math.max(0, demandKeys.length - coveredIngredients),
      coveredCount: coveredIngredients,
      totalIngredients: demandKeys.length,
    });

    if (coveredIngredients === demandKeys.length && subtotal < bestMarketTotal) {
      bestMarketTotal = subtotal;
      bestMarketKey = marketKey;
    }

    colorIndex += 1;
  });

  comparison.sort((a, b) => a.total - b.total);

  if (!bestMarketKey && comparison.length) {
    bestMarketKey = comparison[0].marketKey;
    bestMarketTotal = comparison[0].total;
  }

  const bestOverall = demandKeys.reduce((sum, ingredientKey) => {
    let ingredientBest = Number.POSITIVE_INFINITY;
    const quantity = Math.max(1, Math.ceil(Number(ingredientDemand.get(ingredientKey)?.quantity || 1)));

    marketEntries.forEach(([, marketMap]) => {
      const found = marketMap.get(ingredientKey);
      if (!found) return;
      const amount = Number(found.price || 0);
      if (Number.isFinite(amount) && amount > 0 && amount < ingredientBest) {
        ingredientBest = amount;
      }
    });

    return sum + (Number.isFinite(ingredientBest) ? ingredientBest * quantity : 0);
  }, 0);

  const missingIngredients = demandKeys.filter(
    (ingredientKey) => !marketEntries.some(([, marketMap]) => marketMap.has(ingredientKey)),
  );

  return {
    lists,
    bestMarketKey,
    bestMarketTotal: Number.isFinite(bestMarketTotal) ? bestMarketTotal : 0,
    comparison,
    optimizedTotal: bestOverall,
    missingIngredients,
  };
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

function planSignature(plan) {
  const days = Array.isArray(plan?.days) ? plan.days : [];
  return days
    .map((day) => {
      const date = String(day?.date || '');
      const meals = Array.isArray(day?.meals) ? day.meals : [];
      const mealSig = meals
        .map((meal) => `${meal?.meal_id || ''}:${meal?.recipe_id || ''}:${meal?.title || ''}`)
        .join('|');
      return `${date}=>${mealSig}`;
    })
    .join('#');
}

function isPersistedCartSnapshot(payload) {
  return !!(payload && typeof payload === 'object' && payload.lists && typeof payload.lists === 'object');
}

function buildCartSnapshot({
  lists,
  activeListId,
  comparison,
  optimizedTotal,
  cartSource,
  lastGeneratedSignature,
}) {
  return {
    lists,
    activeListId,
    comparison,
    optimizedTotal,
    cartSource,
    lastGeneratedSignature,
    savedAt: new Date().toISOString(),
  };
}

function applyCartSnapshotToState(snapshot, setters) {
  if (!isPersistedCartSnapshot(snapshot)) {
    return false;
  }

  const persistedLists = snapshot.lists || {};
  const persistedActive = String(snapshot.activeListId || '');
  const fallbackListId = Object.keys(persistedLists)[0] || '';

  setters.setLists(persistedLists);
  setters.setComparison(Array.isArray(snapshot.comparison) ? snapshot.comparison : []);
  setters.setOptimizedTotal(Number(snapshot.optimizedTotal || 0));
  setters.setCartSource(String(snapshot.cartSource || 'meal-plan'));
  setters.setLastGeneratedSignature(String(snapshot.lastGeneratedSignature || ''));
  setters.setActiveListId(
    persistedActive && persistedLists[persistedActive] ? persistedActive : fallbackListId,
  );
  return true;
}

export default function Shopping() {
  const accountId = useMemo(() => {
    const profile = parseStorage(PROFILE_KEY, null);
    return resolveAccountId(profile);
  }, []);

  const [lists, setLists] = useState({});
  const [activeListId, setActiveListId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [cheapestResult, setCheapestResult] = useState(null);
  const [ingredientMatches, setIngredientMatches] = useState(EMPTY_ITEMS);
  const [weeklyPlan, setWeeklyPlan] = useState(() => parseStorage(scopedKey(WEEKLY_PLAN_KEY, accountId), null));
  const [comparison, setComparison] = useState([]);
  const [optimizedTotal, setOptimizedTotal] = useState(0);
  const [generationStatus, setGenerationStatus] = useState('');
  const [isGeneratingCart, setIsGeneratingCart] = useState(false);
  const [cartSource, setCartSource] = useState('manual');
  const [lastGeneratedSignature, setLastGeneratedSignature] = useState('');
  const [checkoutStatus, setCheckoutStatus] = useState('');
  const generateCartRef = useRef(null);

  const loadPrices = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const prices = await listLatestPrices();
      const nextLists = buildListsFromPrices(prices);
      const firstListId = Object.keys(nextLists)[0] || '';
      setLists(nextLists);
      setComparison([]);
      setOptimizedTotal(0);
      setCartSource('manual');
      setLastGeneratedSignature('');
      setActiveListId((previous) => (previous && nextLists[previous] ? previous : firstListId));
    } catch (error) {
      setLoadError(error.message || 'Não foi possível carregar os preços.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generateCartFromMealPlan = useCallback(async () => {
    const currentPlan = parseStorage(scopedKey(WEEKLY_PLAN_KEY, accountId), null) || weeklyPlan;
    if (!currentPlan?.days?.length) {
      setGenerationStatus('Ainda não existe um plano de refeições com receitas para gerar carrinho.');
      return;
    }

    setIsGeneratingCart(true);
    setGenerationStatus('A recolher preços reais no supermercado e a gerar carrinho...');

    try {
      const generatedCart = await generateShoppingCartFromMealPlan(currentPlan);
      const applied = applyCartSnapshotToState(generatedCart, {
        setLists,
        setComparison,
        setOptimizedTotal,
        setCartSource,
        setLastGeneratedSignature,
        setActiveListId,
      });

      if (!applied) {
        throw new Error('Resposta inválida ao gerar carrinho.');
      }

      const missingIngredients = Array.isArray(generatedCart?.missingIngredients)
        ? generatedCart.missingIngredients
        : [];

      if (missingIngredients.length) {
        setGenerationStatus(
          `Carrinho gerado com lacunas: ${missingIngredients.length} ingredientes sem preços importados.`,
        );
      } else {
        const generatedComparison = Array.isArray(generatedCart?.comparison) ? generatedCart.comparison : [];
        const bestMarketKey = String(generatedCart?.activeListId || '');
        const winning = generatedComparison.find((entry) => entry.marketKey === bestMarketKey)
          || generatedComparison[0];
        const total = Number(winning?.total || 0);
        setGenerationStatus(
          `Carrinho gerado com todos os ingredientes do plano: ${winning?.supermarket || 'N/D'} (${formatCurrency(total)}).`,
        );
      }
    } catch (error) {
      const errorText = String(error?.message || '').toLowerCase();
      const shouldFallbackLocal =
        errorText.includes('not found')
        || errorText.includes('404')
        || errorText.includes('405');

      if (!shouldFallbackLocal) {
        setGenerationStatus(error.message || 'Não foi possível gerar o carrinho automaticamente.');
        return;
      }

      try {
        const recipeIds = Array.from(
          new Set(
            (currentPlan.days || [])
              .flatMap((day) => day?.meals || [])
              .map((meal) => Number(meal?.recipe_id || meal?.recipeId || 0))
              .filter((id) => Number.isInteger(id) && id > 0),
          ),
        );

        if (!recipeIds.length) {
          throw new Error('Plano sem receitas identificáveis para construir carrinho.');
        }

        const [recipes, prices] = await Promise.all([
          Promise.all(recipeIds.map((recipeId) => fetchRecipeById(recipeId).catch(() => null))),
          listLatestPrices(),
        ]);

        const validRecipes = recipes.filter(Boolean);
        const demand = mergeDemandMaps(
          extractDemandFromRecipes(validRecipes),
          extractDemandFromRecipeDescriptions(validRecipes),
          extractDemandFromPlanPreview(currentPlan),
        );

        if (!demand.size) {
          throw new Error('As receitas do plano não têm ingredientes suficientes para gerar carrinho.');
        }

        const generated = buildGeneratedLists(prices, demand);
        if (!Object.keys(generated.lists).length) {
          throw new Error('Não há preços disponíveis para os ingredientes do teu plano.');
        }

        const generatedSignature = planSignature(currentPlan);
        const selectedListId = generated.bestMarketKey || Object.keys(generated.lists)[0] || '';

        setLists(generated.lists);
        setComparison(generated.comparison);
        setOptimizedTotal(generated.optimizedTotal);
        setActiveListId(selectedListId);
        setCartSource('meal-plan');
        setLastGeneratedSignature(generatedSignature);

        try {
          await savePersistedShoppingCart(
            buildCartSnapshot({
              lists: generated.lists,
              activeListId: selectedListId,
              comparison: generated.comparison,
              optimizedTotal: generated.optimizedTotal,
              cartSource: 'meal-plan',
              lastGeneratedSignature: generatedSignature,
            }),
          );
        } catch {
          // Persistência é best-effort no fallback local.
        }

        setGenerationStatus(
          'Carrinho gerado em modo local (fallback) porque o endpoint de geração ainda não está disponível.',
        );
      } catch (fallbackError) {
        setGenerationStatus(
          fallbackError.message || 'Não foi possível gerar o carrinho automaticamente.',
        );
      }
    } finally {
      setIsGeneratingCart(false);
    }
  }, [accountId, weeklyPlan]);

  useEffect(() => {
    generateCartRef.current = generateCartFromMealPlan;
  }, [generateCartFromMealPlan]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setIsLoading(true);
      setLoadError('');

      try {
        const persisted = await fetchPersistedShoppingCart();
        if (
          !cancelled
          && applyCartSnapshotToState(persisted, {
            setLists,
            setComparison,
            setOptimizedTotal,
            setCartSource,
            setLastGeneratedSignature,
            setActiveListId,
          })
        ) {
          setGenerationStatus('Carrinho carregado da base de dados.');
          return;
        }

        if (!cancelled) {
          await loadPrices();
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || 'Não foi possível carregar o carrinho persistido.');
          await loadPrices();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadPrices]);

  useEffect(() => {
    const storageKey = scopedKey(WEEKLY_PLAN_KEY, accountId);

    const syncPlan = () => {
      const next = parseStorage(storageKey, null);
      setWeeklyPlan((previous) => {
        const previousSerialized = JSON.stringify(previous ?? null);
        const nextSerialized = JSON.stringify(next ?? null);
        return previousSerialized === nextSerialized ? previous : next;
      });
    };

    const onPlanUpdated = (event) => {
      const payloadAccountId = event?.detail?.accountId;
      if (!payloadAccountId || payloadAccountId === accountId) {
        syncPlan();
      }
    };

    const onStorage = (event) => {
      if (event.key === storageKey || event.key === CART_GENERATE_REQUEST_KEY) {
        syncPlan();
      }

      if (event.key === CART_GENERATE_REQUEST_KEY && event.newValue) {
        localStorage.removeItem(CART_GENERATE_REQUEST_KEY);
        void generateCartRef.current?.();
      }
    };

    const onShoppingCartUpdated = (event) => {
      const payloadAccountId = event?.detail?.accountId;
      if (payloadAccountId && payloadAccountId !== accountId) {
        return;
      }

      const snapshot = event?.detail?.shoppingCart;
      const applied = applyCartSnapshotToState(snapshot, {
        setLists,
        setComparison,
        setOptimizedTotal,
        setCartSource,
        setLastGeneratedSignature,
        setActiveListId,
      });

      if (applied) {
        setGenerationStatus('Carrinho otimizado atualizado pelo NutriBot.');
      }
    };

    syncPlan();
    window.addEventListener('nutribot:weekly-plan-updated', onPlanUpdated);
    window.addEventListener('storage', onStorage);
    window.addEventListener('nutribot:shopping-cart-updated', onShoppingCartUpdated);

    if (localStorage.getItem(CART_GENERATE_REQUEST_KEY)) {
      localStorage.removeItem(CART_GENERATE_REQUEST_KEY);
      void generateCartRef.current?.();
    }

    return () => {
      window.removeEventListener('nutribot:weekly-plan-updated', onPlanUpdated);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('nutribot:shopping-cart-updated', onShoppingCartUpdated);
    };
  }, [accountId]);

  useEffect(() => {
    if (cartSource !== 'meal-plan') {
      return;
    }

    const currentSignature = planSignature(weeklyPlan);
    if (!currentSignature || currentSignature === lastGeneratedSignature) {
      return;
    }

    void generateCartFromMealPlan();
  }, [cartSource, generateCartFromMealPlan, lastGeneratedSignature, weeklyPlan]);



  useEffect(() => {
    if (cartSource !== 'meal-plan' || !Object.keys(lists).length) {
      return;
    }

    const persistTimeout = setTimeout(() => {
      void savePersistedShoppingCart(
        buildCartSnapshot({
          lists,
          activeListId,
          comparison,
          optimizedTotal,
          cartSource,
          lastGeneratedSignature,
        }),
      );
    }, 350);

    return () => {
      clearTimeout(persistTimeout);
    };
  }, [
    lists,
    activeListId,
    comparison,
    optimizedTotal,
    cartSource,
    lastGeneratedSignature,
  ]);

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

  const summary = useMemo(() => {
    const subtotal = activeItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
    const checkedItems = activeItems.filter((item) => item.checked).length;
    const totalUnits = activeItems.reduce((total, item) => total + item.quantity, 0);
    const currency = activeItems[0]?.currency || 'EUR';

    const bestScenarioTotal = optimizedTotal > 0 ? optimizedTotal : subtotal;
    const saving = Math.max(0, subtotal - bestScenarioTotal);

    return {
      subtotal,
      checkedItems,
      totalUnits,
      currency,
      saving,
    };
  }, [activeItems, optimizedTotal]);

  const marketEntries = Object.entries(lists);
  const hasData = marketEntries.length > 0;

  const bestComparison = comparison.length ? comparison[0] : null;


  const handleProceedToCheckout = () => {
    const marketName = String(activeList?.name || '').trim();
    const cartItems = Array.isArray(activeItems) ? activeItems : [];

    if (!marketName || !cartItems.length) {
      setCheckoutStatus('Seleciona um supermercado com produtos antes de avançar para checkout.');
      return;
    }

    const plan = buildMarketCheckoutPlan(marketName, cartItems);
    const navigationQueue = [
      ...plan.addToCartUrls,
      ...plan.fallbackProductUrls,
      ...(plan.checkoutUrl ? [plan.checkoutUrl] : []),
    ];

    if (!navigationQueue.length) {
      setCheckoutStatus('Não existem links de produto válidos para enviar automaticamente para o checkout.');
      return;
    }

    const checkoutWindow = window.open(navigationQueue[0], '_blank');
    if (!checkoutWindow) {
      setCheckoutStatus('O browser bloqueou a abertura. Permite pop-ups para continuar com o checkout.');
      return;
    }

    navigationQueue.slice(1).forEach((url, index) => {
      window.setTimeout(() => {
        try {
          checkoutWindow.location.href = url;
        } catch {
          window.open(url, '_blank');
        }
      }, 900 * (index + 1));
    });

    if (plan.unresolvedCount > 0) {
      setCheckoutStatus(
        `A abrir ${marketName} com os produtos disponíveis. ${plan.unresolvedCount} item(ns) não têm link de compra direto.`,
      );
      return;
    }

    setCheckoutStatus(`A abrir ${marketName} com os produtos do carrinho para finalizar checkout.`);
  };

  return (
    <Layout>
      <div className="page">
        <div className="container-xl">
          <div className="shopping-page">
            <PageHeader
              className="shopping-header page-header d-print-none"
              title="Lista de Compras"
              subtitle="Gera automaticamente o carrinho com base no teu plano e compara preços por supermercado."
              tag={(
                <div className="shopping-header-tag badge bg-primary-lt text-primary">
                  <ShoppingCart size={16} />
                  Preços atuais
                </div>
              )}
            />

            <div className="shopping-grid">
              <section className="shopping-lists-panel card">
            <h2>Listas por supermercado</h2>

            <button
              type="button"
              className="suggestion-chip shopping-generate-btn btn btn-primary"
              onClick={() => void generateCartFromMealPlan()}
              disabled={isGeneratingCart}
            >
              {isGeneratingCart ? 'A gerar carrinho...' : 'Gerar carrinho'}
            </button>
            {generationStatus ? <p className="shopping-feedback">{generationStatus}</p> : null}

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

            {comparison.length ? (
              <div className="shopping-comparison">
                <h3>Diferença de preços</h3>
                {comparison.map((entry) => (
                  <div key={entry.marketKey} className="shopping-comparison-row">
                    <div>
                      <strong>{entry.supermarket}</strong>
                      {Number.isFinite(Number(entry.healthScore)) ? (
                        <small>Saúde: {Number(entry.healthScore).toFixed(1)} • Score: {Number(entry.marketScore || 0).toFixed(2)}</small>
                      ) : null}
                      {entry.missingCount > 0 ? (
                        <small>
                          {entry.coveredCount}/{entry.totalIngredients} ingredientes com preço
                        </small>
                      ) : null}
                      {Number(entry.budgetPenalty || 0) > 0 ? (
                        <small>Penalização orçamento: {Number(entry.budgetPenalty).toFixed(2)}</small>
                      ) : null}
                    </div>
                    <div className="shopping-comparison-prices">
                      <span>{formatCurrency(entry.total)}</span>
                      <small>
                        {entry.marketKey === bestComparison?.marketKey
                          ? 'Melhor equilíbrio'
                          : `+${formatCurrency(Math.max(0, entry.total - (bestComparison?.total || 0)))}`}
                      </small>
                    </div>
                  </div>
                ))}
                <p className="shopping-feedback shopping-optimized-note">
                  Melhor cenário combinando supermercados: {formatCurrency(optimizedTotal)}.
                </p>
              </div>
            ) : null}

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

              </section>

              <section className="shopping-cart-panel card">
            <header className="shopping-cart-header">
              <h2>
                {activeList?.name ? `Carrinho - ${activeList.name}` : 'Carrinho'} ({activeItems.length})
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

                      <button
                        type="button"
                        className="trash-btn"
                        onClick={() => removeItem(item.id)}
                        aria-label="Remover item"
                      >
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
                <span>Poupança face ao melhor cenário otimizado</span>
                <strong className="saving">{formatCurrency(summary.saving, summary.currency)}</strong>
              </div>
              <div className="summary-row">
                <span>Subtotal ({summary.totalUnits} un)</span>
                <strong>{formatCurrency(summary.subtotal, summary.currency)}</strong>
              </div>

              <button
                type="button"
                className="checkout-btn btn btn-success"
                disabled={!activeItems.length}
                onClick={handleProceedToCheckout}
              >
                Avançar para checkout
              </button>
              <p className="checkout-note">
                {checkoutStatus || 'Esta lista usa os últimos preços importados em `/api/prices`.'}
              </p>
            </footer>
              </section>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
