-- Placeholder measurement for the medicine check rule (testing-check-verdict-correctness, phase 6).
--
-- Read-only: the runner wraps this file in BEGIN READ ONLY ... ROLLBACK, so the database itself refuses any write.
-- Local databases only (the runner refuses any other host). Run from the repository root after
-- `npm run registry:import` filled the local registry; it prints one JSON array per statement, in file order:
--   1 registry state, 2 local lower()/NBSP check, 3 suspicious common names, 4 NBSP counts,
--   5 separator counts, 6 separator samples, 7 whitespace-only variant key pairs, 8 their samples.
--
-- DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node -e "const pg=require('pg'),fs=require('fs');const u=process.env.DATABASE_URL||'';if(!/@(127\.0\.0\.1|localhost)[:\/]/.test(u))throw new Error('local DATABASE_URL only');(async()=>{const c=new pg.Client({connectionString:u});await c.connect();try{const r=await c.query('begin read only;'+fs.readFileSync(process.argv[1],'utf8')+';rollback;');for(const x of r)if(x.command==='SELECT')console.log(JSON.stringify(x.rows))}finally{await c.end()}})()" context/archive/2026-10-10-testing-check-verdict-correctness/placeholder-measurement.sql
--
-- Everything is measured through medicine_check_common_name_set / medicine_check_substance_set, so it counts what
-- the rule sees. Withdrawn products are included on purpose: a withdrawn pack in the kit is still compared.

-- 1. Registry state ---------------------------------------------------------------------------------------------
select
  l.version as list_version,
  l.snapshot_date,
  l.variant_count,
  (select count(*) from public.registry_products) as products,
  (select count(*) from public.registry_products where removed_at is null) as active_products,
  (select count(*) from public.registry_product_substances) as substance_rows
from public.registry_search_list l;

-- 2. The locale check that production has to repeat -------------------------------------------------------------
select lower('ŻÓŁĆ') as lowered, 'a' || chr(160) || 'b' ~ '\s' as nbsp_is_whitespace;

-- 3. Common names shared by products whose substance sets are disjoint ------------------------------------------
-- A name is suspicious when, within one common-name set, two non-empty substance sets share no substance: the rule
-- answers "same substance" for them although the compositions differ. "shared_first_word" is only a hint for sorting
-- (Acidum ascorbicum and Acidum folicum share it and are different substances); it filters nothing out.
with product_sets as (
  select
    p.id,
    p.name,
    p.strength,
    public.medicine_check_common_name_set(p.common_name) as cn_set,
    public.medicine_check_substance_set(p.id) as sub_set
  from public.registry_products p
),
distinct_sets as (
  select cn_set, sub_set, min(id) as sample_id
  from product_sets
  where cardinality(cn_set) > 0 and cardinality(sub_set) > 0
  group by cn_set, sub_set
),
suspicious as (
  select distinct a.cn_set
  from distinct_sets a
  join distinct_sets b on b.cn_set = a.cn_set and a.sub_set < b.sub_set and not (a.sub_set && b.sub_set)
),
per_name as (
  select
    s.cn_set,
    (select count(*) from product_sets ps where ps.cn_set = s.cn_set) as products,
    (select count(*) from distinct_sets d where d.cn_set = s.cn_set) as distinct_sets
  from suspicious s
),
first_words as (
  -- number of distinct substance sets of the name that hold a substance starting with the given word
  select d.cn_set, split_part(sub, ' ', 1) as word, count(distinct d.sub_set) as sets_with_word
  from distinct_sets d
  cross join lateral unnest(d.sub_set) as sub
  where d.cn_set in (select cn_set from suspicious)
  group by d.cn_set, split_part(sub, ' ', 1)
),
ranked_samples as (
  select
    d.cn_set,
    row_number() over (partition by d.cn_set order by d.sub_set) as rn,
    ps.name || coalesce(' ' || ps.strength, '') || ' [' || array_to_string(d.sub_set, '; ') || ']' as sample
  from distinct_sets d
  join product_sets ps on ps.id = d.sample_id
  where d.cn_set in (select cn_set from suspicious)
)
select
  array_to_string(n.cn_set, ' + ') as common_name,
  n.products,
  n.distinct_sets,
  exists (
    select 1 from first_words f where f.cn_set = n.cn_set and f.sets_with_word = n.distinct_sets
  ) as shared_first_word,
  (select string_agg(r.sample, ' | ' order by r.rn) from ranked_samples r where r.cn_set = n.cn_set and r.rn <= 3) as samples
from per_name n
order by shared_first_word, n.products desc, common_name;

-- 4. Values with a non-breaking space ---------------------------------------------------------------------------
select 'registry_products.name' as field, count(*) as values_with_nbsp
  from public.registry_products where name like '%' || chr(160) || '%'
union all
select 'registry_products.strength', count(*)
  from public.registry_products where strength like '%' || chr(160) || '%'
union all
select 'registry_products.pharmaceutical_form', count(*)
  from public.registry_products where pharmaceutical_form like '%' || chr(160) || '%'
union all
select 'registry_products.common_name', count(*)
  from public.registry_products where common_name like '%' || chr(160) || '%'
union all
select 'registry_product_substances.name', count(*)
  from public.registry_product_substances where name like '%' || chr(160) || '%';

-- 5. Common names with a separator other than "+" (comma, semicolon, slash) -------------------------------------
select
  count(distinct common_name) as distinct_common_names,
  count(*) as products
from public.registry_products
where common_name ~ '[,;/]';

-- 6. Samples of the above (the most frequent first) -------------------------------------------------------------
select common_name, count(*) as products
from public.registry_products
where common_name ~ '[,;/]'
group by common_name
order by products desc, common_name
limit 10;

-- 7. Variant keys that differ only in whitespace ----------------------------------------------------------------
-- The variant key is (lower name, lower strength, lower form), as in medicine_check. Two keys that are equal once
-- every run of whitespace (NBSP included) is collapsed and trimmed are one medicine to a human and two to the rule.
with raw_keys as (
  select
    lower(name) as k_name,
    lower(coalesce(strength, '')) as k_strength,
    lower(coalesce(pharmaceutical_form, '')) as k_form,
    count(*) as products
  from public.registry_products
  group by 1, 2, 3
),
normalized as (
  select
    btrim(regexp_replace(k_name, '[\s ]+', ' ', 'g')) as n_name,
    btrim(regexp_replace(k_strength, '[\s ]+', ' ', 'g')) as n_strength,
    btrim(regexp_replace(k_form, '[\s ]+', ' ', 'g')) as n_form,
    count(*) as raw_key_count,
    sum(products) as products
  from raw_keys
  group by 1, 2, 3
)
select
  count(*) filter (where raw_key_count > 1) as normalized_keys_with_variants,
  coalesce(sum(raw_key_count * (raw_key_count - 1) / 2) filter (where raw_key_count > 1), 0) as key_pairs,
  coalesce(sum(products) filter (where raw_key_count > 1), 0) as products_involved
from normalized;

-- 8. Samples of the above ---------------------------------------------------------------------------------------
with raw_keys as (
  select
    lower(name) as k_name,
    lower(coalesce(strength, '')) as k_strength,
    lower(coalesce(pharmaceutical_form, '')) as k_form
  from public.registry_products
  group by 1, 2, 3
)
select
  btrim(regexp_replace(k_name, '[\s ]+', ' ', 'g')) as n_name,
  btrim(regexp_replace(k_strength, '[\s ]+', ' ', 'g')) as n_strength,
  btrim(regexp_replace(k_form, '[\s ]+', ' ', 'g')) as n_form,
  count(*) as raw_key_count,
  json_agg(json_build_array(k_name, k_strength, k_form)) as raw_keys
from raw_keys
group by 1, 2, 3
having count(*) > 1
order by raw_key_count desc, n_name
limit 10;
