export interface Country {
  id: number;
  iso_code: number;
  name: string;
  emoji: string;
  tagline: string | null;
  recipe_count: number;
}

export interface RecipeIngredient {
  id: number;
  name: string;
}

export interface Recipe {
  id: number;
  name: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  time_minutes: number;
  youtube_id: string | null;
  ingredients: RecipeIngredient[];
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface CountryRecipes {
  country: Pick<Country, 'id' | 'name' | 'emoji' | 'tagline'>;
  recipes: Recipe[];
  pagination: Pagination;
}

export interface Stats {
  paises_con_recetas: number;
  total_recetas: number;
  ingredientes_distintos: number;
  recetas_con_video: number;
}

export interface TopIngredient {
  id: number;
  name: string;
  uses: number;
}

export interface SearchCountry {
  id: number;
  name: string;
  emoji: string;
}

export interface SearchRecipe {
  id: number;
  name: string;
  country_id: number;
  country_name: string;
  emoji: string;
}

export interface SearchIngredient {
  id: number;
  name: string;
  uses: number;
}

export interface SearchResults {
  countries: SearchCountry[];
  recipes: SearchRecipe[];
  ingredients: SearchIngredient[];
}

export interface Favorite {
  id: number;
  name: string;
  difficulty: Recipe['difficulty'];
  time_minutes: number;
  country_id: number;
  country_name: string;
  emoji: string;
}

export interface IngredientRecipes {
  ingredient: { id: number; name: string };
  recipes: Array<{
    recipe_id: number;
    recipe_name: string;
    difficulty: Recipe['difficulty'];
    country_id: number;
    country_name: string;
    emoji: string;
  }>;
}

export interface SessionUser {
  username: string;
  role: 'user' | 'admin';
}

export interface AdminRecipe {
  id: number;
  country_id: number;
  country_name: string;
  name: string;
  description: string;
  difficulty: Recipe['difficulty'];
  time_minutes: number;
  youtube_id: string | null;
  ingredients: string[];
}

export interface AdminCountry {
  id: number;
  name: string;
  emoji: string;
  tagline: string | null;
}

export interface AdminIngredient {
  id: number;
  name: string;
  uses: number;
}

export interface AdminData {
  recipes: AdminRecipe[];
  countries: AdminCountry[];
  ingredients: AdminIngredient[];
}

export interface AdminSession {
  id: number;
  username: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  ip: string | null;
  user_agent: string | null;
}

export interface ConsentInput {
  accept_terms: boolean;
  accept_privacy: boolean;
  age_confirmed: boolean;
}
