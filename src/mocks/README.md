# Mocks Layer

Моки полностью изолированы в `src/mocks/**` и подключаются через `src/api/projects.ts`.

## Как включить

В `.env`:

```env
VITE_USE_MOCKS=true
VITE_MOCK_SCENARIO=default
```

`VITE_MOCK_SCENARIO` поддерживает:
- `default` (по умолчанию)
- `error-in-templates`

## Карта хранилища (in-memory)

Источник состояния: `src/mocks/store/db.ts`

- `projects: Project[]` (поля `shortName`, `fullName`, `name`)
- `ordersByProjectId: Record<string, DocumentRecord[]>`
- `actsByOrderId: Record<string, DocumentRecord[]>`
- `groupsByOrderId: Record<string, GroupRecord[]>`
- `templatesByOrderId: Record<string, TemplateRecord[]>`
- `tasksByOrderAndGroup: Record<string, Record<string, TaskRecord[]>>`
- `infographicsByOrderAndYear: Record<string, Record<string, DashboardInfographicsResponse>>`
- `infographicsPollByOrderAndYear: Record<string, { attempts, readyAfter, startedAt, updatedAt }>`

## API, добавленные для UI

- `createProject(shortName, fullName, options?)` / `updateProject(..., { shortName?, fullName? })`
- `updateTasksStatusBulk(...)` — массовая смена статуса задач
- `getOrderRisks(projectId, orderId, { year?, quarter?, groupId? })` — организационные риски для вкладки «Риски» на дашборде

Риски в mock-режиме вычисляются из in-memory задач:
- выполненные без профессиональной проверки (по группам);
- доля выполненных задач ниже 70% (высокий);
- неравномерная нагрузка между исполнителями в группе (средний);
- просроченные дедлайны;
- мягкое предупреждение по единицам измерения (`unitsWarning && !unitsBlocked`).

В seed-данных примерно каждая 3-я задача — мягкое предупреждение по единицам (приказ: «2 документа», акт: «1 документ» и т.п., см. `utils/taskUnits.ts`).

## Сценарии

- `default`
  - Небольшие задержки загрузки
  - CRUD и polling-сценарии работают штатно
- `error-in-templates`
  - `generateTemplate(...)` возвращает ошибку
  - Для проверки обработки ошибок на странице приказа

## Где что лежит

- `api/projects.mock.ts` - mock-реализация API контракта
- `data/seed.ts` - стартовые тестовые данные
- `store/db.ts` - состояние in-memory БД
- `utils/delay.ts` - сетевые задержки и сценарии
- `utils/id.ts` - генератор идентификаторов
- `utils/clone.ts` - безопасное копирование ответов
