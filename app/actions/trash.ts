"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Restore an exact delete batch (clears the three delete columns for it). */
export async function restoreBatch(batchId: string, courseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_batch", { _batch_id: batchId });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/courses/${courseId}/trash`);
  revalidatePath(`/courses/${courseId}`);
  return { ok: true as const };
}
