import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Search,
  Rocket,
  ShoppingCart,
  Scissors,
  LayoutGrid,
  Package,
  BookOpen,
  ChevronRight,
  ArrowLeft,
  HelpCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HELP_CATEGORIES } from '@/content/help/types';
import {
  allArticles,
  getArticlesByCategory,
  getArticleBySlug,
  searchArticles,
} from '@/content/help/articles';
import { MarkdownRenderer } from '@/components/help/MarkdownRenderer';

// Icon mapping for categories
const categoryIcons: Record<string, React.ReactNode> = {
  Rocket: <Rocket className="h-5 w-5" />,
  ShoppingCart: <ShoppingCart className="h-5 w-5" />,
  Scissors: <Scissors className="h-5 w-5" />,
  LayoutGrid: <LayoutGrid className="h-5 w-5" />,
  Package: <Package className="h-5 w-5" />,
  BookOpen: <BookOpen className="h-5 w-5" />,
};

export default function HelpCenterPage() {
  const { category, slug } = useParams<{ category?: string; slug?: string }>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Get search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchArticles(searchQuery);
  }, [searchQuery]);

  // Get current article if viewing one
  const currentArticle = useMemo(() => {
    if (category && slug) {
      return getArticleBySlug(category, slug);
    }
    return null;
  }, [category, slug]);

  // Get articles for current category
  const categoryArticles = useMemo(() => {
    if (category) {
      return getArticlesByCategory(category);
    }
    return [];
  }, [category]);

  // Get current category info
  const currentCategory = useMemo(() => {
    return HELP_CATEGORIES.find((c) => c.id === category);
  }, [category]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleArticleClick = (articleCategory: string, articleSlug: string) => {
    setSearchQuery('');
    setMobileMenuOpen(false);
    navigate(`/help/${articleCategory}/${articleSlug}`);
  };

  const handleCategoryClick = (categoryId: string) => {
    setMobileMenuOpen(false);
    navigate(`/help/${categoryId}`);
  };

  // Sidebar Component
  const Sidebar = () => (
    <div className="space-y-1">
      {HELP_CATEGORIES.sort((a, b) => a.order - b.order).map((cat) => {
        const isActive = category === cat.id;
        const articles = getArticlesByCategory(cat.id);

        return (
          <div key={cat.id}>
            <button
              onClick={() => handleCategoryClick(cat.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                isActive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'hover:bg-gray-50 text-gray-700'
              )}
            >
              <span
                className={cn(
                  'p-1.5 rounded-lg',
                  isActive ? 'bg-emerald-100' : 'bg-gray-100'
                )}
              >
                {categoryIcons[cat.icon]}
              </span>
              <span className="font-medium text-sm">{cat.name}</span>
            </button>

            {/* Show articles if category is active */}
            {isActive && articles.length > 0 && (
              <div className="ml-12 mt-1 space-y-0.5">
                {articles.map((article) => (
                  <button
                    key={article.slug}
                    onClick={() => handleArticleClick(cat.id, article.slug)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors',
                      slug === article.slug
                        ? 'text-emerald-700 font-medium bg-emerald-50/50'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    )}
                  >
                    {article.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // Home View (no category selected)
  const HomeView = () => (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl mb-4">
          <HelpCircle className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          How can we help?
        </h1>
        <p className="text-gray-500 max-w-md mx-auto">
          Search our knowledge base or browse categories below
        </p>
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {HELP_CATEGORIES.sort((a, b) => a.order - b.order).map((cat) => {
          const articles = getArticlesByCategory(cat.id);
          return (
            <Card
              key={cat.id}
              className="cursor-pointer hover:shadow-md transition-shadow border-gray-100"
              onClick={() => handleCategoryClick(cat.id)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <span className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                    {categoryIcons[cat.icon]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {cat.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-2 line-clamp-2">
                      {cat.description}
                    </p>
                    <span className="text-xs text-gray-400">
                      {articles.length} article{articles.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Popular Articles */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Popular Articles
        </h2>
        <div className="space-y-2">
          {allArticles.slice(0, 5).map((article) => {
            const articleCategory = HELP_CATEGORIES.find(
              (c) => c.id === article.category
            );
            return (
              <button
                key={`${article.category}-${article.slug}`}
                onClick={() => handleArticleClick(article.category, article.slug)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <span className="p-1.5 bg-gray-100 rounded-lg text-gray-500">
                  {categoryIcons[articleCategory?.icon || 'BookOpen']}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">
                    {article.title}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {articleCategory?.name}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Category View (category selected, no article)
  const CategoryView = () => (
    <div className="space-y-6">
      {/* Category Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/help')}
          className="flex-shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {currentCategory?.name}
          </h1>
          <p className="text-gray-500">{currentCategory?.description}</p>
        </div>
      </div>

      {/* Articles List */}
      <div className="space-y-3">
        {categoryArticles.map((article) => (
          <Card
            key={article.slug}
            className="cursor-pointer hover:shadow-md transition-shadow border-gray-100"
            onClick={() => handleArticleClick(category!, article.slug)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{article.title}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {article.description}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  // Article View
  const ArticleView = () => {
    if (!currentArticle) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-500">Article not found</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate('/help')}
          >
            Return to Help Center
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link to="/help" className="text-gray-500 hover:text-gray-700">
            Help Center
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <Link
            to={`/help/${category}`}
            className="text-gray-500 hover:text-gray-700"
          >
            {currentCategory?.name}
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <span className="text-gray-900 font-medium">{currentArticle.title}</span>
        </div>

        {/* Article Content */}
        <Card className="border-gray-100">
          <CardContent className="p-6 md:p-8">
            <MarkdownRenderer content={currentArticle.content} />
          </CardContent>
        </Card>

        {/* Article Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <Button
            variant="ghost"
            onClick={() => navigate(`/help/${category}`)}
            className="text-gray-500"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to {currentCategory?.name}
          </Button>

          {/* Tags */}
          <div className="flex items-center gap-2">
            {currentArticle.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Search Results View
  const SearchResultsView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Search Results
          <span className="text-gray-400 font-normal ml-2">
            ({searchResults.length} found)
          </span>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSearchQuery('')}
          className="text-gray-500"
        >
          Clear search
        </Button>
      </div>

      {searchResults.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No articles found for "{searchQuery}"</p>
          <p className="text-sm text-gray-400 mt-1">
            Try different keywords or browse categories
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {searchResults.map((article) => {
            const articleCategory = HELP_CATEGORIES.find(
              (c) => c.id === article.category
            );
            return (
              <Card
                key={`${article.category}-${article.slug}`}
                className="cursor-pointer hover:shadow-md transition-shadow border-gray-100"
                onClick={() => handleArticleClick(article.category, article.slug)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600 mt-0.5">
                      {categoryIcons[articleCategory?.icon || 'BookOpen']}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900">
                        {article.title}
                      </h3>
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                        {article.description}
                      </p>
                      <span className="text-xs text-gray-400 mt-1 inline-block">
                        {articleCategory?.name}
                      </span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  // Determine which view to show
  const renderContent = () => {
    if (searchQuery.trim()) {
      return <SearchResultsView />;
    }
    if (currentArticle) {
      return <ArticleView />;
    }
    if (category) {
      return <CategoryView />;
    }
    return <HomeView />;
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="border-b border-gray-100 pb-6">
        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-3">
          <HelpCircle className="h-8 w-8 text-emerald-500" />
          Help Center
        </h1>
        <p className="text-gray-500 mt-1">
          Find answers and learn how to use Sproutify Micro
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <Input
          type="text"
          placeholder="Search help articles..."
          value={searchQuery}
          onChange={handleSearch}
          className="pl-12 h-12"
        />
      </div>

      {/* Mobile Category Toggle */}
      <div className="lg:hidden">
        <Button
          variant="outline"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-full justify-between"
        >
          <span>
            {currentCategory ? currentCategory.name : 'Browse Categories'}
          </span>
          <ChevronRight
            className={cn(
              'h-5 w-5 transition-transform',
              mobileMenuOpen && 'rotate-90'
            )}
          />
        </Button>
        {mobileMenuOpen && (
          <Card className="mt-2 border-gray-100">
            <CardContent className="p-4">
              <Sidebar />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main Layout */}
      <div className="flex gap-8">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <Card className="sticky top-6 border-gray-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Categories
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Sidebar />
            </CardContent>
          </Card>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">{renderContent()}</main>
      </div>
    </div>
  );
}
