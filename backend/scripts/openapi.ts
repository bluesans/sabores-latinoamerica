/**
 * Inventario OpenAPI 3.1 determinista del backend (todo 21).
 *
 * Se construye a mano desde el inventario real de rutas para no requerir
 * servidor ni base de datos al exportar. `openapi:check` compara el archivo
 * versionado contra esta definición.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const errorSchema = { $ref: '#/components/schemas/Error' } as const;
const okSchema = { $ref: '#/components/schemas/Ok' } as const;

function errorResponse(description: string): Json {
    return {
        description,
        content: { 'application/json': { schema: errorSchema } }
    };
}

function okResponse(description: string, schema: Json = okSchema): Json {
    return {
        description,
        content: { 'application/json': { schema } }
    };
}

function body(schema: Json, required = true): Json {
    return { required, content: { 'application/json': { schema } } };
}

function operation(tag: string, summary: string, secured: boolean, responses: Record<string, Json>, requestBody?: Json): Json {
    return {
        tags: [tag],
        summary,
        ...(secured ? { security: [{ bearerAuth: [] }] } : {}),
        ...(requestBody === undefined ? {} : { requestBody }),
        responses
    };
}

function idParam(description = 'Identificador numérico.'): Json {
    return { name: 'id', in: 'path', required: true, description, schema: { type: 'integer', minimum: 1 } };
}

function withParams(op: Json, parameters: Json[]): Json {
    return { ...(op as Record<string, Json>), parameters };
}

function stringProperty(description?: string): Json {
    return description === undefined ? { type: 'string' } : { type: 'string', description };
}

export function buildOpenApi(): Json {
    const unauthorized = errorResponse('Falta el Bearer o es inválido.');
    const forbidden = errorResponse('El usuario no es administrador.');
    const notFound = errorResponse('Recurso inexistente.');
    const invalid = errorResponse('Parámetros o body inválidos.');
    const serverError = errorResponse('Error interno.');

    return {
        openapi: '3.1.0',
        info: {
            title: 'Sabores de Latinoamérica API',
            version: '1.0.0',
            description: 'Paridad funcional con la API PHP v1 (Slim 4) más DELETE /auth/account.'
        },
        servers: [{ url: '/sabores-latinoamerica/api' }],
        tags: [
            { name: 'health', description: 'Estado del servicio.' },
            { name: 'auth', description: 'Registro, sesión y cuenta.' },
            { name: 'resources', description: 'Recursos públicos autenticados.' },
            { name: 'favorites', description: 'Favoritos por usuario.' },
            { name: 'admin', description: 'Administración (rol admin).' }
        ],
        paths: {
            '/health': {
                get: operation('health', 'Healthcheck con ping a la base', false, {
                    '200': okResponse('API y DB disponibles.', { $ref: '#/components/schemas/Health' }),
                    '503': okResponse('DB no disponible.', { $ref: '#/components/schemas/Health' })
                })
            },
            '/auth/register': {
                post: operation(
                    'auth',
                    'Registrar usuario común',
                    false,
                    {
                        '200': okResponse('Usuario creado.', { $ref: '#/components/schemas/AuthSuccess' }),
                        '409': errorResponse('El usuario ya existe.'),
                        '422': invalid,
                        '429': errorResponse('Rate limit de registro.')
                    },
                    body({ $ref: '#/components/schemas/RegisterRequest' })
                )
            },
            '/auth/login': {
                post: operation(
                    'auth',
                    'Login con access + refresh cookie',
                    false,
                    {
                        '200': okResponse('Credenciales válidas.', { $ref: '#/components/schemas/AuthSuccess' }),
                        '401': errorResponse('Credenciales incorrectas.'),
                        '429': errorResponse('Rate limit de login.')
                    },
                    body({ $ref: '#/components/schemas/LoginRequest' })
                )
            },
            '/auth/logout': {
                post: operation(
                    'auth',
                    'Logout idempotente',
                    false,
                    {
                        '200': okResponse('Sesión cerrada o ya inexistente.')
                    },
                    body({ $ref: '#/components/schemas/LogoutRequest' }, false)
                )
            },
            '/auth/refresh': {
                post: operation('auth', 'Rotar refresh cookie', false, {
                    '200': okResponse('Token rotado.', { $ref: '#/components/schemas/AuthSuccess' }),
                    '401': errorResponse('Sesión expirada o reutilizada.'),
                    '429': errorResponse('Rate limit de refresh.')
                })
            },
            '/auth/check': {
                get: operation('auth', 'Usuario autenticado vigente', true, {
                    '200': okResponse('Usuario vigente.', { $ref: '#/components/schemas/CheckSuccess' }),
                    '401': unauthorized
                })
            },
            '/auth/account': {
                delete: operation(
                    'auth',
                    'Eliminar la propia cuenta',
                    true,
                    {
                        '200': okResponse('Cuenta eliminada.'),
                        '401': unauthorized,
                        '403': errorResponse('Contraseña incorrecta.'),
                        '409': errorResponse('Última cuenta admin.'),
                        '429': errorResponse('Rate limit de delete.')
                    },
                    body({ $ref: '#/components/schemas/DeleteAccountRequest' })
                )
            },
            '/countries': {
                get: operation('resources', 'Países con recetas', true, {
                    '200': okResponse('Listado de países.', { $ref: '#/components/schemas/CountriesSuccess' }),
                    '401': unauthorized
                })
            },
            '/countries/{id}/recipes': {
                get: withParams(
                    operation('resources', 'Recetas de un país, paginadas', true, {
                        '200': okResponse('País + recetas + paginación.', { $ref: '#/components/schemas/CountryRecipesSuccess' }),
                        '400': invalid,
                        '401': unauthorized,
                        '404': notFound
                    }),
                    [idParam(), { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } }, { name: 'per_page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }]
                )
            },
            '/stats': {
                get: operation('resources', 'Totales y top de ingredientes', true, {
                    '200': okResponse('Estadísticas.', { $ref: '#/components/schemas/StatsSuccess' }),
                    '401': unauthorized
                })
            },
            '/ingredients/{id}': {
                get: operation('resources', 'Ingrediente y recetas que lo usan', true, {
                    '200': okResponse('Ingrediente y recetas.', { $ref: '#/components/schemas/IngredientSuccess' }),
                    '400': invalid,
                    '401': unauthorized,
                    '404': notFound
                })
            },
            '/search': {
                get: operation('resources', 'Búsqueda literal de países/recetas/ingredientes', true, {
                    '200': okResponse('Resultados acotados.', { $ref: '#/components/schemas/SearchSuccess' }),
                    '401': unauthorized
                }),
                parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }]
            },
            '/favorites': {
                get: operation('favorites', 'Favoritos del usuario', true, {
                    '200': okResponse('Favoritos.', { $ref: '#/components/schemas/FavoritesSuccess' }),
                    '401': unauthorized
                }),
                post: operation(
                    'favorites',
                    'Toggle de favorito',
                    true,
                    {
                        '200': okResponse('Toggle aplicado.'),
                        '400': invalid,
                        '401': unauthorized,
                        '404': notFound
                    },
                    body({ $ref: '#/components/schemas/FavoriteToggleRequest' })
                )
            },
            '/admin/data': {
                get: operation('admin', 'Datos completos para el panel', true, {
                    '200': okResponse('Recetas, países e ingredientes.', { $ref: '#/components/schemas/AdminDataSuccess' }),
                    '401': unauthorized,
                    '403': forbidden
                })
            },
            '/admin/recipes': {
                post: operation(
                    'admin',
                    'Crear o actualizar receta',
                    true,
                    {
                        '200': okResponse('Receta guardada.', { $ref: '#/components/schemas/AdminRecipeSuccess' }),
                        '401': unauthorized,
                        '403': forbidden,
                        '404': notFound,
                        '422': invalid,
                        '500': serverError
                    },
                    body({ $ref: '#/components/schemas/AdminRecipeRequest' })
                )
            },
            '/admin/recipes/{id}': {
                delete: operation('admin', 'Eliminar receta', true, {
                    '200': okResponse('Receta eliminada.'),
                    '401': unauthorized,
                    '403': forbidden,
                    '404': notFound
                })
            },
            '/admin/countries/{id}': {
                put: operation(
                    'admin',
                    'Actualizar emoji/tagline de país',
                    true,
                    {
                        '200': okResponse('País actualizado.'),
                        '400': invalid,
                        '401': unauthorized,
                        '403': forbidden,
                        '404': notFound,
                        '422': invalid
                    },
                    body({ $ref: '#/components/schemas/AdminCountryRequest' })
                )
            },
            '/admin/ingredients/{id}': {
                put: operation(
                    'admin',
                    'Renombrar ingrediente',
                    true,
                    {
                        '200': okResponse('Ingrediente renombrado.'),
                        '400': invalid,
                        '401': unauthorized,
                        '403': forbidden,
                        '404': notFound,
                        '409': errorResponse('Nombre duplicado.'),
                        '422': invalid
                    },
                    body({ $ref: '#/components/schemas/AdminIngredientRenameRequest' })
                ),
                delete: operation('admin', 'Eliminar ingrediente', true, {
                    '200': okResponse('Ingrediente eliminado.'),
                    '400': invalid,
                    '401': unauthorized,
                    '403': forbidden,
                    '404': notFound
                })
            },
            '/admin/sessions': {
                get: operation('admin', 'Sesiones con usuario', true, {
                    '200': okResponse('Sesiones.', { $ref: '#/components/schemas/AdminSessionsSuccess' }),
                    '401': unauthorized,
                    '403': forbidden
                })
            },
            '/admin/sessions/{id}': {
                delete: operation('admin', 'Revocar sesión (soft)', true, {
                    '200': okResponse('Sesión revocada.'),
                    '400': invalid,
                    '401': unauthorized,
                    '403': forbidden,
                    '404': notFound
                })
            }
        },
        components: {
            securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
            schemas: {
                Error: {
                    type: 'object',
                    required: ['ok', 'error'],
                    properties: { ok: { type: 'boolean', enum: [false] }, error: stringProperty(), id: stringProperty() }
                },
                Ok: {
                    type: 'object',
                    required: ['ok'],
                    properties: { ok: { type: 'boolean', enum: [true] } }
                },
                Health: {
                    type: 'object',
                    required: ['ok', 'api', 'db', 'time'],
                    properties: { ok: { type: 'boolean' }, api: { type: 'boolean' }, db: { type: 'boolean' }, time: stringProperty('UTC ISO-8601.') }
                },
                AuthSuccess: {
                    type: 'object',
                    required: ['ok', 'username', 'role', 'access'],
                    properties: { ok: { type: 'boolean' }, username: stringProperty(), role: { type: 'string', enum: ['user', 'admin'] }, access: stringProperty() }
                },
                CheckSuccess: {
                    type: 'object',
                    required: ['ok', 'username', 'role'],
                    properties: { ok: { type: 'boolean' }, username: stringProperty(), role: stringProperty() }
                },
                RegisterRequest: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                        username: stringProperty(),
                        password: stringProperty(),
                        consent_version: stringProperty(),
                        accepted_terms: { type: 'boolean' },
                        accepted_privacy: { type: 'boolean' },
                        age_confirmed: { type: 'boolean' }
                    }
                },
                LoginRequest: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: { username: stringProperty(), password: stringProperty() }
                },
                LogoutRequest: { type: 'object', properties: { refresh: stringProperty() } },
                DeleteAccountRequest: {
                    type: 'object',
                    required: ['password'],
                    properties: { password: stringProperty() }
                },
                Country: {
                    type: 'object',
                    properties: { id: { type: 'integer' }, name: stringProperty(), emoji: stringProperty(), tagline: stringProperty() }
                },
                CountriesSuccess: {
                    type: 'object',
                    required: ['ok', 'countries'],
                    properties: { ok: { type: 'boolean' }, countries: { type: 'array', items: { $ref: '#/components/schemas/Country' } } }
                },
                Recipe: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: stringProperty(),
                        description: stringProperty(),
                        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                        time_minutes: { type: ['integer', 'null'] },
                        youtube_id: { type: ['string', 'null'] }
                    }
                },
                CountryRecipesSuccess: {
                    type: 'object',
                    required: ['ok', 'country', 'recipes', 'pagination'],
                    properties: {
                        ok: { type: 'boolean' },
                        country: { $ref: '#/components/schemas/Country' },
                        recipes: { type: 'array', items: { $ref: '#/components/schemas/Recipe' } },
                        pagination: { $ref: '#/components/schemas/Pagination' }
                    }
                },
                Pagination: {
                    type: 'object',
                    properties: { page: { type: 'integer' }, per_page: { type: 'integer' }, total: { type: 'integer' }, total_pages: { type: 'integer' } }
                },
                StatsSuccess: {
                    type: 'object',
                    required: ['ok', 'stats', 'top_ingredients'],
                    properties: {
                        ok: { type: 'boolean' },
                        stats: { type: 'object' },
                        top_ingredients: { type: 'array', items: { type: 'object' } }
                    }
                },
                IngredientSuccess: {
                    type: 'object',
                    required: ['ok', 'ingredient', 'recipes'],
                    properties: { ok: { type: 'boolean' }, ingredient: { type: 'object' }, recipes: { type: 'array', items: { type: 'object' } } }
                },
                SearchSuccess: {
                    type: 'object',
                    required: ['ok', 'countries', 'recipes', 'ingredients'],
                    properties: {
                        ok: { type: 'boolean' },
                        countries: { type: 'array', items: { type: 'object' } },
                        recipes: { type: 'array', items: { type: 'object' } },
                        ingredients: { type: 'array', items: { type: 'object' } }
                    }
                },
                FavoritesSuccess: {
                    type: 'object',
                    required: ['ok', 'favorites'],
                    properties: { ok: { type: 'boolean' }, favorites: { type: 'array', items: { type: 'object' } } }
                },
                FavoriteToggleRequest: {
                    type: 'object',
                    required: ['recipe_id'],
                    properties: { recipe_id: { type: 'integer', minimum: 1 }, add: { description: 'Truthiness PHP: 0/""/false/[] quitan; el resto agrega.' } }
                },
                AdminDataSuccess: {
                    type: 'object',
                    required: ['ok', 'recipes', 'countries', 'ingredients'],
                    properties: {
                        ok: { type: 'boolean' },
                        recipes: { type: 'array', items: { type: 'object' } },
                        countries: { type: 'array', items: { type: 'object' } },
                        ingredients: { type: 'array', items: { type: 'object' } }
                    }
                },
                AdminRecipeRequest: {
                    type: 'object',
                    required: ['name', 'country_id'],
                    properties: {
                        id: { type: 'integer' },
                        name: stringProperty(),
                        country_id: { type: 'integer' },
                        description: stringProperty(),
                        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                        time_minutes: { type: ['integer', 'string', 'null'] },
                        youtube_id: stringProperty(),
                        ingredients: { type: 'array', items: { type: 'string' } }
                    }
                },
                AdminRecipeSuccess: {
                    type: 'object',
                    required: ['ok', 'id'],
                    properties: { ok: { type: 'boolean' }, id: { type: 'integer' } }
                },
                AdminCountryRequest: {
                    type: 'object',
                    properties: { emoji: stringProperty(), tagline: stringProperty() }
                },
                AdminIngredientRenameRequest: {
                    type: 'object',
                    required: ['name'],
                    properties: { name: stringProperty() }
                },
                AdminSessionsSuccess: {
                    type: 'object',
                    required: ['ok', 'sessions'],
                    properties: { ok: { type: 'boolean' }, sessions: { type: 'array', items: { type: 'object' } } }
                }
            }
        }
    };
}

/** Ordena recursivamente las claves para que el export sea determinista. */
export function sortDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortDeep);
    }

    if (value !== null && typeof value === 'object') {
        const sorted: Record<string, unknown> = {};

        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
        }

        return sorted;
    }

    return value;
}

export function canonicalOpenApi(): string {
    return `${JSON.stringify(sortDeep(buildOpenApi()), null, 2)}\n`;
}
