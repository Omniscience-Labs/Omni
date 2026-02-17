drop extension if exists "pg_net";

drop extension if exists "pgjwt";

create extension if not exists "pg_net" with schema "public";

drop function if exists "public"."get_agent_knowledge_base"(p_agent_id uuid, p_include_inactive boolean);


  create table if not exists "public"."agent_llamacloud_kb_assignments" (
    "assignment_id" uuid not null default gen_random_uuid(),
    "agent_id" uuid not null,
    "kb_id" uuid not null,
    "account_id" uuid not null,
    "enabled" boolean default true,
    "assigned_at" timestamp with time zone default now()
      );


alter table "public"."agent_llamacloud_kb_assignments" enable row level security;


  create table if not exists "public"."agent_llamacloud_knowledge_bases" (
    "kb_id" uuid not null default gen_random_uuid(),
    "agent_id" uuid not null,
    "account_id" uuid not null,
    "name" character varying(255) not null,
    "index_name" character varying(255) not null,
    "description" text,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."agent_llamacloud_knowledge_bases" enable row level security;


  create table if not exists "public"."llamacloud_knowledge_bases" (
    "kb_id" uuid not null default gen_random_uuid(),
    "account_id" uuid not null,
    "name" character varying(255) not null,
    "index_name" character varying(255) not null,
    "description" text,
    "folder_id" uuid,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "summary" text,
    "usage_context" character varying(100) default 'always'::character varying
      );


alter table "public"."llamacloud_knowledge_bases" enable row level security;

CREATE UNIQUE INDEX IF NOT EXISTS agent_llamacloud_kb_assignments_agent_id_kb_id_key ON public.agent_llamacloud_kb_assignments USING btree (agent_id, kb_id);

CREATE UNIQUE INDEX IF NOT EXISTS agent_llamacloud_kb_assignments_pkey ON public.agent_llamacloud_kb_assignments USING btree (assignment_id);

-- Legacy agent_llamacloud_knowledge_bases may have "id" not "kb_id"; create pkey index on whichever exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_llamacloud_knowledge_bases' AND column_name = 'kb_id') THEN
        CREATE UNIQUE INDEX IF NOT EXISTS agent_llamacloud_knowledge_bases_pkey ON public.agent_llamacloud_knowledge_bases USING btree (kb_id);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_llamacloud_knowledge_bases' AND column_name = 'id') THEN
        CREATE UNIQUE INDEX IF NOT EXISTS agent_llamacloud_knowledge_bases_pkey ON public.agent_llamacloud_knowledge_bases USING btree (id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_assignments_account_id ON public.agent_llamacloud_kb_assignments USING btree (account_id);

CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_assignments_enabled ON public.agent_llamacloud_kb_assignments USING btree (enabled);

CREATE INDEX IF NOT EXISTS idx_agent_llamacloud_kb_agent_id ON public.agent_llamacloud_knowledge_bases USING btree (agent_id);

CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_account_id ON public.llamacloud_knowledge_bases USING btree (account_id);

CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_assignments_agent_id ON public.agent_llamacloud_kb_assignments USING btree (agent_id);

CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_assignments_kb_id ON public.agent_llamacloud_kb_assignments USING btree (kb_id);

CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_created_at ON public.llamacloud_knowledge_bases USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_folder_id ON public.llamacloud_knowledge_bases USING btree (folder_id);

CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_is_active ON public.llamacloud_knowledge_bases USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_llamacloud_kb_usage_context ON public.llamacloud_knowledge_bases USING btree (usage_context);

CREATE UNIQUE INDEX IF NOT EXISTS llamacloud_kb_unique_index_per_account ON public.llamacloud_knowledge_bases USING btree (account_id, index_name);

CREATE UNIQUE INDEX IF NOT EXISTS llamacloud_knowledge_bases_pkey ON public.llamacloud_knowledge_bases USING btree (kb_id);

-- Safely add constraints only if they don't already exist (V2 DB compatibility)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_llamacloud_kb_assignments_pkey') THEN
        ALTER TABLE "public"."agent_llamacloud_kb_assignments" ADD CONSTRAINT "agent_llamacloud_kb_assignments_pkey" PRIMARY KEY USING INDEX "agent_llamacloud_kb_assignments_pkey";
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_llamacloud_knowledge_bases_pkey') THEN
        ALTER TABLE "public"."agent_llamacloud_knowledge_bases" ADD CONSTRAINT "agent_llamacloud_knowledge_bases_pkey" PRIMARY KEY USING INDEX "agent_llamacloud_knowledge_bases_pkey";
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'llamacloud_knowledge_bases_pkey') THEN
        ALTER TABLE "public"."llamacloud_knowledge_bases" ADD CONSTRAINT "llamacloud_knowledge_bases_pkey" PRIMARY KEY USING INDEX "llamacloud_knowledge_bases_pkey";
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_llamacloud_kb_assignments_account_id_fkey') THEN
        ALTER TABLE "public"."agent_llamacloud_kb_assignments" ADD CONSTRAINT "agent_llamacloud_kb_assignments_account_id_fkey" FOREIGN KEY (account_id) REFERENCES basejump.accounts(id) ON DELETE CASCADE NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."agent_llamacloud_kb_assignments" VALIDATE CONSTRAINT "agent_llamacloud_kb_assignments_account_id_fkey";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_llamacloud_kb_assignments_agent_id_fkey') THEN
        ALTER TABLE "public"."agent_llamacloud_kb_assignments" ADD CONSTRAINT "agent_llamacloud_kb_assignments_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.agents(agent_id) ON DELETE CASCADE NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."agent_llamacloud_kb_assignments" VALIDATE CONSTRAINT "agent_llamacloud_kb_assignments_agent_id_fkey";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_llamacloud_kb_assignments_agent_id_kb_id_key') THEN
        ALTER TABLE "public"."agent_llamacloud_kb_assignments" ADD CONSTRAINT "agent_llamacloud_kb_assignments_agent_id_kb_id_key" UNIQUE USING INDEX "agent_llamacloud_kb_assignments_agent_id_kb_id_key";
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_llamacloud_kb_assignments_kb_id_fkey') THEN
        ALTER TABLE "public"."agent_llamacloud_kb_assignments" ADD CONSTRAINT "agent_llamacloud_kb_assignments_kb_id_fkey" FOREIGN KEY (kb_id) REFERENCES public.llamacloud_knowledge_bases(kb_id) ON DELETE CASCADE NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."agent_llamacloud_kb_assignments" VALIDATE CONSTRAINT "agent_llamacloud_kb_assignments_kb_id_fkey";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_llamacloud_kb_index_not_empty') THEN
        ALTER TABLE "public"."agent_llamacloud_knowledge_bases" ADD CONSTRAINT "agent_llamacloud_kb_index_not_empty" CHECK ((length(TRIM(BOTH FROM index_name)) > 0)) NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."agent_llamacloud_knowledge_bases" VALIDATE CONSTRAINT "agent_llamacloud_kb_index_not_empty";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_llamacloud_kb_name_not_empty') THEN
        ALTER TABLE "public"."agent_llamacloud_knowledge_bases" ADD CONSTRAINT "agent_llamacloud_kb_name_not_empty" CHECK ((length(TRIM(BOTH FROM name)) > 0)) NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."agent_llamacloud_knowledge_bases" VALIDATE CONSTRAINT "agent_llamacloud_kb_name_not_empty";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_llamacloud_knowledge_bases_account_id_fkey') THEN
        ALTER TABLE "public"."agent_llamacloud_knowledge_bases" ADD CONSTRAINT "agent_llamacloud_knowledge_bases_account_id_fkey" FOREIGN KEY (account_id) REFERENCES basejump.accounts(id) ON DELETE CASCADE NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."agent_llamacloud_knowledge_bases" VALIDATE CONSTRAINT "agent_llamacloud_knowledge_bases_account_id_fkey";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_llamacloud_knowledge_bases_agent_id_fkey') THEN
        ALTER TABLE "public"."agent_llamacloud_knowledge_bases" ADD CONSTRAINT "agent_llamacloud_knowledge_bases_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.agents(agent_id) ON DELETE CASCADE NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."agent_llamacloud_knowledge_bases" VALIDATE CONSTRAINT "agent_llamacloud_knowledge_bases_agent_id_fkey";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'llamacloud_kb_index_not_empty') THEN
        ALTER TABLE "public"."llamacloud_knowledge_bases" ADD CONSTRAINT "llamacloud_kb_index_not_empty" CHECK ((length(TRIM(BOTH FROM index_name)) > 0)) NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."llamacloud_knowledge_bases" VALIDATE CONSTRAINT "llamacloud_kb_index_not_empty";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'llamacloud_kb_name_not_empty') THEN
        ALTER TABLE "public"."llamacloud_knowledge_bases" ADD CONSTRAINT "llamacloud_kb_name_not_empty" CHECK ((length(TRIM(BOTH FROM name)) > 0)) NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."llamacloud_knowledge_bases" VALIDATE CONSTRAINT "llamacloud_kb_name_not_empty";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'llamacloud_kb_unique_index_per_account') THEN
        ALTER TABLE "public"."llamacloud_knowledge_bases" ADD CONSTRAINT "llamacloud_kb_unique_index_per_account" UNIQUE USING INDEX "llamacloud_kb_unique_index_per_account";
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'llamacloud_kb_usage_context_check') THEN
        ALTER TABLE "public"."llamacloud_knowledge_bases" ADD CONSTRAINT "llamacloud_kb_usage_context_check" CHECK (((usage_context)::text = ANY ((ARRAY['always'::character varying, 'on_request'::character varying, 'contextual'::character varying])::text[]))) NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."llamacloud_knowledge_bases" VALIDATE CONSTRAINT "llamacloud_kb_usage_context_check";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'llamacloud_knowledge_bases_account_id_fkey') THEN
        ALTER TABLE "public"."llamacloud_knowledge_bases" ADD CONSTRAINT "llamacloud_knowledge_bases_account_id_fkey" FOREIGN KEY (account_id) REFERENCES basejump.accounts(id) ON DELETE CASCADE NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."llamacloud_knowledge_bases" VALIDATE CONSTRAINT "llamacloud_knowledge_bases_account_id_fkey";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'llamacloud_knowledge_bases_folder_id_fkey') THEN
        ALTER TABLE "public"."llamacloud_knowledge_bases" ADD CONSTRAINT "llamacloud_knowledge_bases_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES public.knowledge_base_folders(folder_id) ON DELETE SET NULL NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."llamacloud_knowledge_bases" VALIDATE CONSTRAINT "llamacloud_knowledge_bases_folder_id_fkey";

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'llamacloud_knowledge_bases_usage_context_check') THEN
        ALTER TABLE "public"."llamacloud_knowledge_bases" ADD CONSTRAINT "llamacloud_knowledge_bases_usage_context_check" CHECK (((usage_context)::text = ANY ((ARRAY['always'::character varying, 'on_request'::character varying, 'contextual'::character varying])::text[]))) NOT VALID;
    END IF;
END $$;
ALTER TABLE "public"."llamacloud_knowledge_bases" VALIDATE CONSTRAINT "llamacloud_knowledge_bases_usage_context_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_account_llamacloud_kbs(p_account_id uuid, p_include_inactive boolean DEFAULT false)
 RETURNS TABLE(kb_id uuid, name character varying, index_name character varying, description text, summary text, usage_context character varying, folder_id uuid, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        lkb.kb_id,
        lkb.name,
        lkb.index_name,
        lkb.description,
        lkb.summary,
        COALESCE(lkb.usage_context, 'always'::VARCHAR(100)) as usage_context,
        lkb.folder_id,
        lkb.is_active,
        lkb.created_at,
        lkb.updated_at
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.account_id = p_account_id
    AND (p_include_inactive OR lkb.is_active = TRUE)
    ORDER BY lkb.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_agent_assigned_llamacloud_kbs(p_agent_id uuid, p_include_inactive boolean DEFAULT false)
 RETURNS TABLE(kb_id uuid, name character varying, index_name character varying, description text, summary text, usage_context character varying, is_active boolean, enabled boolean, created_at timestamp with time zone, updated_at timestamp with time zone, assigned_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        lkb.kb_id,
        lkb.name,
        lkb.index_name,
        lkb.description,
        lkb.summary,
        COALESCE(lkb.usage_context, 'always'::VARCHAR(100)) as usage_context,
        lkb.is_active,
        ala.enabled,
        lkb.created_at,
        lkb.updated_at,
        ala.assigned_at
    FROM llamacloud_knowledge_bases lkb
    JOIN agent_llamacloud_kb_assignments ala ON lkb.kb_id = ala.kb_id
    WHERE ala.agent_id = p_agent_id
    AND (p_include_inactive OR (lkb.is_active = TRUE AND ala.enabled = TRUE))
    ORDER BY ala.assigned_at DESC;
END;
$function$
;

-- Drop first so return type can change (legacy may return id, we return kb_id)
DROP FUNCTION IF EXISTS public.get_agent_llamacloud_knowledge_bases(uuid, boolean);

CREATE OR REPLACE FUNCTION public.get_agent_llamacloud_knowledge_bases(p_agent_id uuid, p_include_inactive boolean DEFAULT false)
 RETURNS TABLE(kb_id uuid, name character varying, index_name character varying, description text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    pk_col text;
BEGIN
    -- Legacy table has "id", new schema has "kb_id"; use whichever exists
    SELECT column_name INTO pk_col
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_llamacloud_knowledge_bases'
    AND column_name IN ('kb_id', 'id')
    ORDER BY CASE column_name WHEN 'kb_id' THEN 0 ELSE 1 END
    LIMIT 1;

    RETURN QUERY EXECUTE format(
        'SELECT alkb.%I, alkb.name, alkb.index_name, alkb.description, alkb.is_active, alkb.created_at, alkb.updated_at
         FROM agent_llamacloud_knowledge_bases alkb
         WHERE alkb.agent_id = $1 AND ($2 OR alkb.is_active = TRUE)
         ORDER BY alkb.created_at DESC',
        COALESCE(pk_col, 'kb_id')
    )
    USING p_agent_id, p_include_inactive;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_folder_entry_count(p_folder_id uuid, p_account_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    -- Count regular files
    SELECT COUNT(*) INTO v_count
    FROM knowledge_base_entries
    WHERE folder_id = p_folder_id
    AND account_id = p_account_id
    AND is_active = TRUE;
    
    -- Add cloud KBs count
    v_count := v_count + (
        SELECT COUNT(*)
        FROM llamacloud_knowledge_bases
        WHERE folder_id = p_folder_id
        AND account_id = p_account_id
        AND is_active = TRUE
    );
    
    RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_unified_folder_entries(p_folder_id uuid, p_account_id uuid, p_include_inactive boolean DEFAULT false)
 RETURNS TABLE(entry_id uuid, entry_type character varying, name character varying, summary text, description text, usage_context character varying, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, filename character varying, file_size bigint, mime_type character varying, index_name character varying)
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Verify folder access
    IF NOT EXISTS (
        SELECT 1 FROM knowledge_base_folders 
        WHERE folder_id = p_folder_id AND account_id = p_account_id
    ) THEN
        RAISE EXCEPTION 'Folder not found or access denied';
    END IF;

    RETURN QUERY
    -- Regular file entries
    SELECT 
        kbe.entry_id,
        'file'::VARCHAR(20) as entry_type,
        kbe.filename as name,
        kbe.summary,
        NULL::TEXT as description,
        kbe.usage_context,
        kbe.is_active,
        kbe.created_at,
        kbe.updated_at,
        kbe.filename,
        kbe.file_size,
        kbe.mime_type,
        NULL::VARCHAR(255) as index_name
    FROM knowledge_base_entries kbe
    WHERE kbe.folder_id = p_folder_id
    AND kbe.account_id = p_account_id
    AND (p_include_inactive OR kbe.is_active = TRUE)
    
    UNION ALL
    
    -- LlamaCloud KB entries
    SELECT 
        lkb.kb_id as entry_id,
        'cloud_kb'::VARCHAR(20) as entry_type,
        lkb.name,
        COALESCE(lkb.summary, lkb.description) as summary,
        lkb.description,
        COALESCE(lkb.usage_context, 'always'::VARCHAR(100)) as usage_context,
        lkb.is_active,
        lkb.created_at,
        lkb.updated_at,
        NULL::VARCHAR(255) as filename,
        NULL::BIGINT as file_size,
        NULL::VARCHAR(255) as mime_type,
        lkb.index_name
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.folder_id = p_folder_id
    AND lkb.account_id = p_account_id
    AND (p_include_inactive OR lkb.is_active = TRUE)
    
    ORDER BY created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_unified_root_entries(p_account_id uuid, p_include_inactive boolean DEFAULT false)
 RETURNS TABLE(entry_id uuid, entry_type character varying, name character varying, summary text, description text, usage_context character varying, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, filename character varying, file_size bigint, mime_type character varying, index_name character varying)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    -- LlamaCloud KBs at root level
    SELECT 
        lkb.kb_id as entry_id,
        'cloud_kb'::VARCHAR(20) as entry_type,
        lkb.name,
        COALESCE(lkb.summary, lkb.description) as summary,
        lkb.description,
        COALESCE(lkb.usage_context, 'always'::VARCHAR(100)) as usage_context,
        lkb.is_active,
        lkb.created_at,
        lkb.updated_at,
        NULL::VARCHAR(255) as filename,
        NULL::BIGINT as file_size,
        NULL::VARCHAR(255) as mime_type,
        lkb.index_name
    FROM llamacloud_knowledge_bases lkb
    WHERE lkb.folder_id IS NULL
    AND lkb.account_id = p_account_id
    AND (p_include_inactive OR lkb.is_active = TRUE)
    
    ORDER BY created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_agent_knowledge_base(p_agent_id uuid, p_include_inactive boolean DEFAULT false)
 RETURNS TABLE(entry_id uuid, entry_type character varying, name character varying, summary text, description text, filename character varying, file_size bigint, mime_type character varying, index_name character varying, folder_id uuid, folder_name character varying, usage_context character varying, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    -- Regular file entries
    SELECT 
        kbe.entry_id,
        'file'::VARCHAR(20) as entry_type,
        kbe.filename as name,
        kbe.summary,
        NULL::TEXT as description,
        kbe.filename,
        kbe.file_size,
        kbe.mime_type,
        NULL::VARCHAR(255) as index_name,
        kbe.folder_id,
        kbf.name as folder_name,
        kbe.usage_context,
        kbe.is_active,
        kbe.created_at,
        kbe.updated_at
    FROM knowledge_base_entries kbe
    JOIN knowledge_base_folders kbf ON kbe.folder_id = kbf.folder_id
    JOIN agent_knowledge_entry_assignments akea ON kbe.entry_id = akea.entry_id
    WHERE akea.agent_id = p_agent_id
    AND akea.enabled = TRUE
    AND (p_include_inactive OR kbe.is_active = TRUE)
    
    UNION ALL
    
    -- LlamaCloud KB entries
    SELECT 
        lkb.kb_id as entry_id,
        'cloud_kb'::VARCHAR(20) as entry_type,
        lkb.name,
        COALESCE(lkb.summary, lkb.description) as summary,
        lkb.description,
        NULL::VARCHAR(255) as filename,
        NULL::BIGINT as file_size,
        NULL::VARCHAR(255) as mime_type,
        lkb.index_name,
        lkb.folder_id,
        kbf.name as folder_name,
        COALESCE(lkb.usage_context, 'always'::VARCHAR(100)) as usage_context,
        lkb.is_active,
        lkb.created_at,
        lkb.updated_at
    FROM llamacloud_knowledge_bases lkb
    LEFT JOIN knowledge_base_folders kbf ON lkb.folder_id = kbf.folder_id
    JOIN agent_llamacloud_kb_assignments alkba ON lkb.kb_id = alkba.kb_id
    WHERE alkba.agent_id = p_agent_id
    AND alkba.enabled = TRUE
    AND (p_include_inactive OR lkb.is_active = TRUE)
    
    ORDER BY created_at DESC;
END;
$function$
;

grant delete on table "public"."agent_llamacloud_kb_assignments" to "anon";

grant insert on table "public"."agent_llamacloud_kb_assignments" to "anon";

grant references on table "public"."agent_llamacloud_kb_assignments" to "anon";

grant select on table "public"."agent_llamacloud_kb_assignments" to "anon";

grant trigger on table "public"."agent_llamacloud_kb_assignments" to "anon";

grant truncate on table "public"."agent_llamacloud_kb_assignments" to "anon";

grant update on table "public"."agent_llamacloud_kb_assignments" to "anon";

grant delete on table "public"."agent_llamacloud_kb_assignments" to "authenticated";

grant insert on table "public"."agent_llamacloud_kb_assignments" to "authenticated";

grant references on table "public"."agent_llamacloud_kb_assignments" to "authenticated";

grant select on table "public"."agent_llamacloud_kb_assignments" to "authenticated";

grant trigger on table "public"."agent_llamacloud_kb_assignments" to "authenticated";

grant truncate on table "public"."agent_llamacloud_kb_assignments" to "authenticated";

grant update on table "public"."agent_llamacloud_kb_assignments" to "authenticated";

grant delete on table "public"."agent_llamacloud_kb_assignments" to "service_role";

grant insert on table "public"."agent_llamacloud_kb_assignments" to "service_role";

grant references on table "public"."agent_llamacloud_kb_assignments" to "service_role";

grant select on table "public"."agent_llamacloud_kb_assignments" to "service_role";

grant trigger on table "public"."agent_llamacloud_kb_assignments" to "service_role";

grant truncate on table "public"."agent_llamacloud_kb_assignments" to "service_role";

grant update on table "public"."agent_llamacloud_kb_assignments" to "service_role";

grant delete on table "public"."agent_llamacloud_knowledge_bases" to "anon";

grant insert on table "public"."agent_llamacloud_knowledge_bases" to "anon";

grant references on table "public"."agent_llamacloud_knowledge_bases" to "anon";

grant select on table "public"."agent_llamacloud_knowledge_bases" to "anon";

grant trigger on table "public"."agent_llamacloud_knowledge_bases" to "anon";

grant truncate on table "public"."agent_llamacloud_knowledge_bases" to "anon";

grant update on table "public"."agent_llamacloud_knowledge_bases" to "anon";

grant delete on table "public"."agent_llamacloud_knowledge_bases" to "authenticated";

grant insert on table "public"."agent_llamacloud_knowledge_bases" to "authenticated";

grant references on table "public"."agent_llamacloud_knowledge_bases" to "authenticated";

grant select on table "public"."agent_llamacloud_knowledge_bases" to "authenticated";

grant trigger on table "public"."agent_llamacloud_knowledge_bases" to "authenticated";

grant truncate on table "public"."agent_llamacloud_knowledge_bases" to "authenticated";

grant update on table "public"."agent_llamacloud_knowledge_bases" to "authenticated";

grant delete on table "public"."agent_llamacloud_knowledge_bases" to "service_role";

grant insert on table "public"."agent_llamacloud_knowledge_bases" to "service_role";

grant references on table "public"."agent_llamacloud_knowledge_bases" to "service_role";

grant select on table "public"."agent_llamacloud_knowledge_bases" to "service_role";

grant trigger on table "public"."agent_llamacloud_knowledge_bases" to "service_role";

grant truncate on table "public"."agent_llamacloud_knowledge_bases" to "service_role";

grant update on table "public"."agent_llamacloud_knowledge_bases" to "service_role";

grant delete on table "public"."llamacloud_knowledge_bases" to "anon";

grant insert on table "public"."llamacloud_knowledge_bases" to "anon";

grant references on table "public"."llamacloud_knowledge_bases" to "anon";

grant select on table "public"."llamacloud_knowledge_bases" to "anon";

grant trigger on table "public"."llamacloud_knowledge_bases" to "anon";

grant truncate on table "public"."llamacloud_knowledge_bases" to "anon";

grant update on table "public"."llamacloud_knowledge_bases" to "anon";

grant delete on table "public"."llamacloud_knowledge_bases" to "authenticated";

grant insert on table "public"."llamacloud_knowledge_bases" to "authenticated";

grant references on table "public"."llamacloud_knowledge_bases" to "authenticated";

grant select on table "public"."llamacloud_knowledge_bases" to "authenticated";

grant trigger on table "public"."llamacloud_knowledge_bases" to "authenticated";

grant truncate on table "public"."llamacloud_knowledge_bases" to "authenticated";

grant update on table "public"."llamacloud_knowledge_bases" to "authenticated";

grant delete on table "public"."llamacloud_knowledge_bases" to "service_role";

grant insert on table "public"."llamacloud_knowledge_bases" to "service_role";

grant references on table "public"."llamacloud_knowledge_bases" to "service_role";

grant select on table "public"."llamacloud_knowledge_bases" to "service_role";

grant trigger on table "public"."llamacloud_knowledge_bases" to "service_role";

grant truncate on table "public"."llamacloud_knowledge_bases" to "service_role";

grant update on table "public"."llamacloud_knowledge_bases" to "service_role";


DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'llamacloud_kb_assignments_account_access' AND tablename = 'agent_llamacloud_kb_assignments') THEN
        CREATE POLICY "llamacloud_kb_assignments_account_access" ON "public"."agent_llamacloud_kb_assignments" AS permissive FOR ALL TO public USING ((basejump.has_role_on_account(account_id) = true));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_llamacloud_kb_account_access' AND tablename = 'agent_llamacloud_knowledge_bases') THEN
        CREATE POLICY "agent_llamacloud_kb_account_access" ON "public"."agent_llamacloud_knowledge_bases" AS permissive FOR ALL TO public USING ((basejump.has_role_on_account(account_id) = true));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'llamacloud_kb_account_access' AND tablename = 'llamacloud_knowledge_bases') THEN
        CREATE POLICY "llamacloud_kb_account_access" ON "public"."llamacloud_knowledge_bases" AS permissive FOR ALL TO public USING ((basejump.has_role_on_account(account_id) = true));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'agent_llamacloud_kb_updated_at') THEN
        CREATE TRIGGER agent_llamacloud_kb_updated_at BEFORE UPDATE ON public.agent_llamacloud_knowledge_bases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'llamacloud_kb_updated_at') THEN
        CREATE TRIGGER llamacloud_kb_updated_at BEFORE UPDATE ON public.llamacloud_knowledge_bases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;


