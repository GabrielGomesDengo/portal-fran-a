-- A função auxiliar só é usada pela trava (security definer); não precisa ficar exposta na API.
revoke execute on function item_sazonal_liberado(text, date) from authenticated;
