<?php
declare(strict_types=1);

$from = dirname(__DIR__) . '/db/sabores_latinoamerica.sql';
$to   = dirname(__DIR__) . '/db/sabores_latinoamerica.fixed.sql';

if (!is_readable($from)) {
    fwrite(STDERR, "No se pudo leer el archivo: $from\n");
    exit(1);
}

$sql = file_get_contents($from);

if ($sql === false) {
    fwrite(STDERR, "No se pudo leer el contenido de: $from\n");
    exit(1);
}

/*
    1. Corregir números partidos.
    Ejemplo: ,9 0, => ,90,
*/
$fixed = preg_replace('/(?<=,)\s*(\d+)\s+(\d+)\s*(?=[,)])/', '$1$2', $sql);
if ($fixed !== null) {
    $sql = $fixed;
}

/*
    2. Corregir valores ENUM de dificultad.
*/
$sql = str_replace(
    [
        "'me dium'",
        "' easy'",
        "' medium'",
        "' hard'",
    ],
    [
        "'medium'",
        "'easy'",
        "'medium'",
        "'hard'",
    ],
    $sql
);

$fixed = preg_replace_callback(
    "/'\s*(easy|medium|hard)\s*'/i",
    static function (array $m): string {
        return "'" . strtolower($m[1]) . "'";
    },
    $sql
);

if ($fixed !== null) {
    $sql = $fixed;
}

/*
    3. Reemplazos conocidos para limpiar textos corruptos.
*/
$replacements = [
    // Países
    "'? ?🇷'" => "'🇧🇷'",
    "'Rep. Domi nicana'" => "'República Dominicana'",
    'Costa, sierra y Amazonía  en un solo plato' => 'Costa, sierra y Amazonía en un solo plato',

    // Recetas: palabras partidas
    'tor tilla' => 'tortilla',
    'gast ronomía' => 'gastronomía',
    'gast ronómico' => 'gastronómico',
    'pa rrilla' => 'parrilla',
    'Locro Cri ollo' => 'Locro Criollo',
    'Minas G erais' => 'Minas Gerais',
    'tod a festa' => 'toda festa',
    'desgran ado' => 'desgranado',
    'F usión criolla-oriental' => 'Fusión criolla-oriental',
    'ají amaril lo' => 'ají amarillo',
    'fr ijoles rojos' => 'frijoles rojos',
    'co n tres tipos' => 'con tres tipos',
    'c on onoto' => 'con onoto',
    'Arepa  de Chócolo' => 'Arepa de Chócolo',
    'Clási co del verano' => 'Clásico del verano',
    'que so amarillo' => 'queso amarillo',
    'ta jadas de plátano' => 'tajadas de plátano',
    'mari nados en limón' => 'marinados en limón',
    'sals a de cerveza' => 'salsa de cerveza',
    'Tortillas de pap a' => 'Tortillas de papa',
    'Empanad a boliviana' => 'Empanada boliviana',
    'Fr icasé Paceño' => 'Fricasé Paceño',
    'Pique M acho' => 'Pique Macho',
    'Cultu ra de reunión' => 'Cultura de reunión',
    'de p avo' => 'de pavo',
    'B olitas de plátano' => 'Bolitas de plátano',
    'celebra ciones familiares' => 'celebraciones familiares',
    'nac ional' => 'nacional',
    'crujie nte' => 'crujiente',
    'masa d e maíz' => 'masa de maíz',
    'm antequilla' => 'mantequilla',
    'tubérc ulos' => 'tubérculos',
    'pa tio' => 'patio',
    'Cevich e de Corvina' => 'Ceviche de Corvina',

    // Ingredientes
    'Choc olate' => 'Chocolate',
    'Co stilla de cerdo' => 'Costilla de cerdo',
    'Leche condens ada' => 'Leche condensada',
    'Pan de mold e' => 'Pan de molde',
    'Pap a criolla' => 'Papa criolla',
    'Caraotas negra s' => 'Caraotas negras',
    'Ají colora do' => 'Ají colorado',
    'Culantro c oyote' => 'Culantro coyote',
    ' 7 tipos de carne' => '7 tipos de carne',
    'Pata  de res' => 'Pata de res',
    'Filete de  ternera' => 'Filete de ternera',
];

foreach ($replacements as $search => $replace) {
    $sql = str_replace($search, $replace, $sql);
}

/*
    4. Colapsar espacios múltiples.
    No toca saltos de línea, solo espacios dobles o más.
*/
$fixed = preg_replace('/ {2,}/', ' ', $sql);
if ($fixed !== null) {
    $sql = $fixed;
}

file_put_contents($to, $sql);

echo "Listo.\n";
echo "Archivo corregido generado en:\n";
echo $to . "\n";