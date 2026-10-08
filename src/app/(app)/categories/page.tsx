import type { Metadata } from "next";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, Dot, EmptyState, PageHeader } from "@/components/ui";
import { AutoForm } from "@/components/forms/auto-form";
import { Disclosure } from "@/components/disclosure";
import { RowActionForm } from "@/components/crud";
import { deleteCategory, saveCategory, toggleCategoryArchived } from "@/actions/categories";
import { categoryTree, listCategories } from "@/lib/queries/catalog";
import { VIZ_SLOTS } from "@/db/seed";
import type { FieldSpec } from "@/components/forms/types";
import type { Category } from "@/db/schema";

export const metadata: Metadata = { title: "Категорії" };

function categoryFields(
  kind: "income" | "expense",
  parents: Category[],
  category?: Category,
): FieldSpec[] {
  return [
    ...(category ? [{ name: "id", type: "hidden" as const, defaultValue: category.id }] : []),
    { name: "kind", type: "hidden", defaultValue: category?.kind ?? kind },
    {
      name: "name",
      label: "Назва",
      type: "text",
      required: true,
      defaultValue: category?.name,
    },
    {
      name: "parentId",
      label: "Батьківська категорія",
      type: "select",
      defaultValue: category?.parentId ?? "",
      hint: "Один рівень вкладеності",
      options: [
        { value: "", label: "Немає (верхній рівень)" },
        ...parents
          .filter((p) => p.id !== category?.id)
          .map((p) => ({ value: String(p.id), label: p.name })),
      ],
    },
    {
      name: "color",
      label: "Колір",
      type: "color",
      defaultValue: category?.color ?? VIZ_SLOTS[0],
    },
    {
      name: "icon",
      label: "Іконка",
      type: "text",
      defaultValue: category?.icon ?? "circle",
      hint: "Назва з lucide.dev, напр. shopping-cart",
    },
  ];
}

export default async function CategoriesPage() {
  const all = listCategories(true);
  const archived = all.filter((c) => c.archived);

  return (
    <>
      <PageHeader
        title="Категорії"
        subtitle="Кольори використовуються у графіках. Типові кольори взяті з перевіреної палітри."
      />

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-2">
        {(["expense", "income"] as const).map((kind) => {
          const tree = categoryTree(kind);
          const parents = all.filter((c) => c.kind === kind && c.parentId === null && !c.archived);

          return (
            <section key={kind}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">
                  {kind === "expense" ? "Витрати" : "Доходи"}
                </h2>
                <Disclosure label="Додати" variant="outline">
                  <Card className="p-4">
                    <AutoForm
                      action={saveCategory}
                      fields={categoryFields(kind, parents)}
                      submitLabel="Створити"
                      compact
                    />
                  </Card>
                </Disclosure>
              </div>

              {tree.length === 0 ? (
                <Card>
                  <EmptyState title="Категорій немає" />
                </Card>
              ) : (
                <div className="space-y-2">
                  {tree.map(({ category, children }) => (
                    <Card key={category.id}>
                      <CardHeader
                        title={
                          <span className="flex items-center gap-2">
                            <Dot color={category.color} />
                            {category.name}
                            {children.length > 0 ? (
                              <Badge>{children.length} підкатегорій</Badge>
                            ) : null}
                          </span>
                        }
                        action={
                          <span className="flex items-center gap-1">
                            <RowActionForm
                              action={toggleCategoryArchived}
                              id={category.id}
                              label="Заархівувати"
                              icon={<Archive className="size-4" aria-hidden />}
                            />
                            <RowActionForm
                              action={deleteCategory}
                              id={category.id}
                              label="Видалити"
                              icon={<Trash2 className="size-4 text-negative" aria-hidden />}
                              confirm={`Видалити «${category.name}»? Операції цієї категорії залишаться, але стануть без категорії.`}
                            />
                          </span>
                        }
                      />
                      <CardBody className="space-y-2">
                        {children.length > 0 ? (
                          <ul className="space-y-1 border-l border-border pl-3">
                            {children.map((child) => (
                              <li
                                key={child.id}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <Dot color={child.color} />
                                  <span className="truncate text-sm text-ink-2">{child.name}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <RowActionForm
                                    action={toggleCategoryArchived}
                                    id={child.id}
                                    label="Заархівувати"
                                    icon={<Archive className="size-3.5" aria-hidden />}
                                  />
                                  <RowActionForm
                                    action={deleteCategory}
                                    id={child.id}
                                    label="Видалити"
                                    icon={<Trash2 className="size-3.5 text-negative" aria-hidden />}
                                    confirm={`Видалити «${child.name}»?`}
                                  />
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <Disclosure label="Редагувати" variant="outline">
                          <AutoForm
                            action={saveCategory}
                            fields={categoryFields(kind, parents, category)}
                            submitLabel="Зберегти"
                            compact
                          />
                        </Disclosure>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {archived.length > 0 ? (
        <section className="mt-7">
          <h2 className="mb-2 text-xs font-medium text-ink-3">Архів</h2>
          <div className="flex flex-wrap gap-2">
            {archived.map((category) => (
              <Card key={category.id} className="flex items-center gap-2 px-3 py-2">
                <Dot color={category.color} />
                <span className="text-sm text-ink-3">{category.name}</span>
                <RowActionForm
                  action={toggleCategoryArchived}
                  id={category.id}
                  label="Відновити"
                  icon={<ArchiveRestore className="size-4" aria-hidden />}
                />
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
