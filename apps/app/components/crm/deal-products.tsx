"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PROPERTY_LABEL, PROPERTY_ROW } from "@/components/detail-sheet";
import { useTRPC } from "@/lib/trpc/client";

type Product = { id: string; name: string };

/**
 * Los productos que vende un deal.
 *
 * En Notion esto es un multi-select. Aca no es un campo custom porque
 * FieldValue guarda un solo optionId por [fieldId, dealId], y porque el motor
 * de forecast necesita la linea de revenue de cada producto, que un label de
 * texto no le da.
 *
 * Se guarda el conjunto entero en cada cambio, no un delta: es la misma
 * semantica que expone la API, y evita que un deal quede facturando por un
 * producto que ya no vende.
 */
export function DealProducts({
	dealId,
	selected,
	onSaved,
}: {
	dealId: string;
	selected: readonly Product[];
	onSaved?: () => void;
}) {
	const trpc = useTRPC();
	const [open, setOpen] = useState(false);

	const catalog = useQuery(trpc.products.list.queryOptions());

	const save = useMutation(
		trpc.products.setForDeal.mutationOptions({
			onSuccess: () => onSaved?.(),
			onError: (error) => toast.error(error.message),
		}),
	);

	const chosen = new Set(selected.map((product) => product.id));

	const toggle = (productId: string) => {
		const next = new Set(chosen);
		if (next.has(productId)) {
			next.delete(productId);
		} else {
			next.add(productId);
		}
		save.mutate({ dealId, productIds: [...next] });
	};

	return (
		<div className={PROPERTY_ROW}>
			<span className={PROPERTY_LABEL}>Productos</span>
			<div className="flex min-w-0 items-center gap-1.5">
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="h-auto min-h-8 w-full justify-between gap-1 px-2 py-1 font-normal"
							disabled={save.isPending}
						>
							<span className="flex min-w-0 flex-wrap gap-1">
								{selected.length === 0 ? (
									<EmptyCellValue />
								) : (
									selected.map((product) => (
										<Badge key={product.id} variant="secondary">
											{product.name}
										</Badge>
									))
								)}
							</span>
							<Icon icon={ChevronDown} className="shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-64 p-0" align="start">
						<Command>
							<CommandInput placeholder="Buscar producto…" />
							<CommandList>
								<CommandEmpty>Ningún producto coincide.</CommandEmpty>
								<CommandGroup>
									{(catalog.data ?? []).map((product) => (
										<CommandItem
											key={product.id}
											value={product.name}
											onSelect={() => toggle(product.id)}
										>
											<Icon
												icon={Checkmark}
												className={cn(
													chosen.has(product.id) ? "opacity-100" : "opacity-0",
												)}
											/>
											{product.name}
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
				{save.isPending ? <Spinner /> : null}
			</div>
		</div>
	);
}
