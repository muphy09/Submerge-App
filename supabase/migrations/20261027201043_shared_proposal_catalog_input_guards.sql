begin;
create or replace function public.collab_input_value(v jsonb, explicit boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; k text; item jsonb;
begin
  if jsonb_typeof(v)='array' then
    select coalesce(jsonb_agg(public.collab_input_value(value,explicit)),'[]') into result from jsonb_array_elements(v);
    return result;
  elsif jsonb_typeof(v)='object' then
    result:='{}';
    for k,item in select key,value from jsonb_each(v) loop
      if k in ('__proto__','constructor','prototype') then continue; end if;
      if jsonb_typeof(v->'features')='array' and k='totalCost' then continue; end if;
      if v->>'source'='grouped' and k=any(array['laborCost','materialCost','totalCost',
        'groupedPricePerSqft','groupedAddonUnitPrice','groupedPricingMode']) then continue; end if;
      if not explicit and k=any(array['price','basePrice','addCost1','addCost2','addCost3','unitPrice','cost',
        'totalCost','total','subtotal','taxAmount','taxRate','percentIncrease','overheadMultiplier',
        'fiberglassModelPrice','spaFiberglassModelPrice','fiberglassCraneCost','raisedSpaFacingCost',
        'totalRBBSqft','totalRaisedBondBeamSqft','hasBeenEdited']) then continue; end if;
      result:=result||jsonb_build_object(k,public.collab_input_value(item,explicit or k=any(array[
        'customOptions','customFeatures','manualAdjustments','retailAdjustments','contractOverrides'])));
    end loop;
    return result;
  end if;
  return v;
end $$;
commit;
notify pgrst, 'reload schema';
