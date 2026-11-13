import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Los tests de integración comparten la DB scratch sabores_node_test:
        // serializar archivos evita DROP/CREATE concurrentes.
        fileParallelism: false
    }
});
