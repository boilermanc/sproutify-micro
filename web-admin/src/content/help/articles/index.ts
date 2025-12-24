import { gettingStartedArticles } from './getting-started';
import { ordersCustomersArticles } from './orders-customers';
import { harvestWorkflowArticles } from './harvest-workflow';
import { trayManagementArticles } from './tray-management';
import { inventoryArticles } from './inventory';
import { recipesArticles } from './recipes';
import type { HelpArticle } from '../types';

export const allArticles: HelpArticle[] = [
  ...gettingStartedArticles,
  ...ordersCustomersArticles,
  ...harvestWorkflowArticles,
  ...trayManagementArticles,
  ...inventoryArticles,
  ...recipesArticles,
];

export function getArticlesByCategory(categoryId: string): HelpArticle[] {
  return allArticles
    .filter((article) => article.category === categoryId)
    .sort((a, b) => a.order - b.order);
}

export function getArticleBySlug(categoryId: string, slug: string): HelpArticle | undefined {
  return allArticles.find(
    (article) => article.category === categoryId && article.slug === slug
  );
}

export function searchArticles(query: string): HelpArticle[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  return allArticles.filter((article) => {
    const searchableText = [
      article.title,
      article.description,
      article.content,
      ...article.tags,
    ]
      .join(' ')
      .toLowerCase();

    return searchableText.includes(lowerQuery);
  });
}
