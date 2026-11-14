import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Los tests de integración comparten la DB scratch sabores_node_test:
        // serializar archivos evita DROP/CREATE concurrentes.
        fileParallelism: false,
        // La suite corre con el comportamiento legacy (consentimiento opcional).
        // Los tests de CONSENT_STRICT lo activan explícitamente al parsear config.
        env: {
            CONSENT_STRICT: '0'
        }
    }
});
