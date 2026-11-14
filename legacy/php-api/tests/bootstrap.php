<?php
declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

$_ENV['JWT_SECRET'] = '5e95fb427d18afd10ff717179185ce7bb12595cc0a09d375da4b9ec57f0f010b';
$_ENV['JWT_TTL'] = '900';
$_ENV['SESSION_DAYS'] = '7';

// Integration harness: rebuild the scratch MySQL schema once per PHPUnit run.
require __DIR__ . '/Integration/bootstrap.php';