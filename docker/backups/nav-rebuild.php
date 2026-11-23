<?php
// Navigation rebuild: footer link normalisation, header nav-menu widget, menu "Menu Arbicop".
$ids=[13,15,17,19,21,23,25,27,38,341,438,502];
$out=WP_CONTENT_DIR.'/uploads/zz-nav/'; @mkdir($out,0777,true);
$bk=[];
foreach($ids as $i){$bk[$i]=get_post_meta($i,'_elementor_data',true);}
file_put_contents($out.'elementor-nav-before-wpfb.json',json_encode($bk,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
$m=wp_get_nav_menu_object('menu-arbicop');
$items=wp_get_nav_menu_items($m->term_id);
$mb=[];foreach($items as $it){$mb[]=['db_id'=>$it->ID,'title'=>$it->title,'url'=>$it->url,'type'=>$it->type,'object'=>$it->object,'object_id'=>$it->object_id,'parent'=>(int)$it->menu_item_parent,'order'=>$it->menu_order,'target'=>$it->target];}
file_put_contents($out.'menu-arbicop-before.json',json_encode(['menu'=>$m->name,'slug'=>$m->slug,'locations'=>get_nav_menu_locations(),'items'=>$mb],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));

$MAP=['inicio'=>'/','nosotros'=>'/nosotros/','beneficios'=>'/beneficios/','contacto'=>'/contacto/','peritaje'=>'/peritaje/','arbitraje'=>'/arbitraje/','conciliacion'=>'/conciliacion/','tasacion'=>'/tasacion/','corretaje'=>'/corretaje/',
 'libro-de-recalamaciones'=>'/libro-de-reclamaciones-2/','libro-de-reclamaciones'=>'/libro-de-reclamaciones-2/','reclamaciones'=>'/libro-de-reclamaciones-2/'];
$log=[];$GLOBALS['MAP']=$MAP;$GLOBALS['log']=&$log;
function navw($dark){
 $c=$dark?'#FFFFFF':'#030D67';
 return ['id'=>substr(md5(uniqid('',true)),0,7),'elType'=>'widget','widgetType'=>'nav-menu','elements'=>[],'settings'=>[
  'menu'=>'menu-arbicop','layout'=>'horizontal','align_items'=>'flex-end','pointer'=>'underline','animation_line'=>'fade',
  'dropdown'=>'tablet','toggle'=>'burger','toggle_align'=>'right','full_width'=>'stretch','text_align'=>'aside',
  'menu_typography_typography'=>'custom','menu_typography_font_size'=>['unit'=>'px','size'=>16,'sizes'=>[]],'menu_typography_font_weight'=>'600',
  'color_menu_item'=>$c,'color_menu_item_hover'=>'#2B9BE8','color_menu_item_active'=>'#2B9BE8','pointer_color_menu_item_hover'=>'#2B9BE8','pointer_color_menu_item_active'=>'#2B9BE8',
  'padding_horizontal_menu_item'=>['unit'=>'px','size'=>12,'sizes'=>[]],
  'color_dropdown_item'=>'#030D67','background_color_dropdown_item'=>'#FFFFFF','color_dropdown_item_hover'=>'#FFFFFF','background_color_dropdown_item_hover'=>'#062250',
  'toggle_color'=>$c,'toggle_background_color'=>'rgba(0,0,0,0)','toggle_size'=>['unit'=>'px','size'=>26,'sizes'=>[]],
 ]];
}
function hideall(&$e){$e['settings']['hide_desktop']='hidden-desktop';$e['settings']['hide_tablet']='hidden-tablet';$e['settings']['hide_mobile']='hidden-mobile';}
function foot(&$els,$pid){global $MAP,$log;
 foreach($els as &$e){
  $w=$e['widgetType']??'';
  if($w==='icon-list' && is_array($e['settings']['icon_list']??null)){
   $texts=array_map(function($x){return sanitize_title($x['text']??'');},$e['settings']['icon_list']);
   $isLinks=array_intersect($texts,['inicio','peritaje','libro-de-recalamaciones','libro-de-reclamaciones','reclamaciones']);
   if($isLinks){
    foreach($e['settings']['icon_list'] as &$it){
     $k=sanitize_title($it['text']??''); if(!isset($MAP[$k]))continue;
     $it['link']=['url'=>$MAP[$k],'is_external'=>'','nofollow'=>'','custom_attributes'=>''];
     if(isset($it['__dynamic__']['link']))unset($it['__dynamic__']['link']);
     if(isset($it['__dynamic__'])&&empty($it['__dynamic__']))unset($it['__dynamic__']);
     if(strpos($k,'libro')===0||$k==='reclamaciones')$it['text']='Libro de Reclamaciones';
    } unset($it);
    if(in_array('inicio',$texts)){
     $have=array_map(function($x){return $x['text'];},$e['settings']['icon_list']);
     $tmpl=$e['settings']['icon_list'][0]; unset($tmpl['__dynamic__']);
     $pos=array_search('contacto',$texts); $new=[];
     foreach([['Tienda','/tienda/',''],['Campus Virtual','https://aula.arbicop.com/','on']] as $n){
      if(in_array($n[0],$have))continue; $x=$tmpl;$x['text']=$n[0];$x['_id']=substr(md5($pid.$n[0]),0,7);$x['link']=['url'=>$n[1],'is_external'=>$n[2],'nofollow'=>'','custom_attributes'=>''];$new[]=$x;}
     array_splice($e['settings']['icon_list'],$pos+1,0,$new); $log[]="$pid: footer links += Tienda, Campus Virtual";
    }
    $log[]="$pid: footer icon-list normalised (".implode(',',$texts).")";
   }
  }
  if($w==='image' && strpos($e['settings']['link']['url']??'','libro-de-reclamaciones')!==false){$e['settings']['link']['url']='/libro-de-reclamaciones-2/';$log[]="$pid: footer badge link relative";}
  if(!empty($e['elements']))foot($e['elements'],$pid);
 }}
foreach($ids as $pid){
 $raw=$bk[$pid]; $d=json_decode($raw,true); if(!$d){$log[]="$pid: no elementor data, skipped";continue;}
 foot($d,$pid);
 if($pid!=502){
  if($pid==13){
   $h=&$d[1];
   $h['settings']['container_type']='flex'; $h['settings']['flex_direction']='row'; $h['settings']['flex_justify_content']='space-between'; $h['settings']['flex_align_items']='center'; $h['settings']['flex_wrap']='nowrap';
   $h['settings']['padding']=['unit'=>'px','top'=>'12','right'=>'40','bottom'=>'12','left'=>'40','isLinked'=>false];
   $h['settings']['padding_mobile']=['unit'=>'px','top'=>'10','right'=>'16','bottom'=>'10','left'=>'16','isLinked'=>false];
   $nav=navw(false); $nav['settings']['_element_width']='initial'; $nav['settings']['_element_custom_width']=['unit'=>'%','size'=>75,'sizes'=>[]];
   $new=[$h['elements'][0],$nav];
   for($k=1;$k<count($h['elements']);$k++){hideall($h['elements'][$k]);$new[]=$h['elements'][$k];}
   $h['elements']=$new; $log[]="13: header buttons hidden, nav-menu added"; unset($h);
  } else {
   $h=&$d[1]; $r=&$h['elements'][1];
   $r['elements'][0]['elements']=[navw(true)]; $r['elements'][0]['settings']['flex_justify_content']='flex-end'; $r['elements'][0]['settings']['width']=['unit'=>'%','size'=>100,'sizes'=>[]]; $r['elements'][0]['settings']['width_mobile']=['unit'=>'%','size'=>100,'sizes'=>[]];
   hideall($r['elements'][1]);
   $log[]="$pid: nav-menu added, old Campus button hidden"; unset($h,$r);
  }
 }
 update_post_meta($pid,'_elementor_data',wp_slash(wp_json_encode($d,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)));
 delete_post_meta($pid,'_elementor_element_cache');
}
// ---- menu
$map=['Inicio'=>'/','Nosotros'=>'/nosotros/','Formaciones'=>'#','Peritaje'=>'/peritaje/','Arbitraje'=>'/arbitraje/','Conciliación'=>'/conciliacion/','Tasación'=>'/tasacion/','Corretaje'=>'/corretaje/','Beneficios'=>'/beneficios/','Contacto'=>'/contacto/'];
$by=[];foreach($items as $it){$by[$it->title]=$it;}
$parent=$by['Formaciones']->ID;
$order=[['Inicio',0],['Nosotros',0],['Formaciones',0],['Peritaje',1],['Arbitraje',1],['Conciliación',1],['Tasación',1],['Corretaje',1],['Beneficios',0],['Tienda',0,'/tienda/'],['Campus Virtual',0,'https://aula.arbicop.com/','_blank'],['Libro de Reclamaciones',0,'/libro-de-reclamaciones-2/'],['Contacto',0],['Intranet',0,'https://rrhh.arbicop.com/','_blank']];
foreach($order as $pos=>$o){
 $t=$o[0]; $id=isset($by[$t])?$by[$t]->ID:0; $url=isset($o[2])?$o[2]:$map[$t];
 $args=['menu-item-title'=>$t,'menu-item-type'=>'custom','menu-item-object'=>'custom','menu-item-object-id'=>0,'menu-item-url'=>$url,'menu-item-status'=>'publish','menu-item-position'=>$pos+1,'menu-item-parent-id'=>$o[1]?$parent:0,'menu-item-target'=>isset($o[3])?$o[3]:''];
 $r=wp_update_nav_menu_item($m->term_id,$id,$args); $log[]="menu: $t => $url (id $r)";
}
file_put_contents($out.'log.txt',implode("\n",$log));
echo implode("\n",$log),"\n";
