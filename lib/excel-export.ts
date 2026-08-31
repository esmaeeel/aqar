import type { Listing } from "@/lib/aqar";

type ExportField={key:keyof Listing;label:string;width:number;kind:"text"|"number";format?:string};
type ExportCell={value:string|number;type:StringConstructor|NumberConstructor;format?:string;fontWeight?:"bold";backgroundColor?:string;textColor?:string;align:"right"|"center";alignVertical:"center";wrap?:boolean;height?:number};

type ExcelExportOptions={
  propertyType:string;
  purpose:"sale"|"rent";
  roomMode:boolean;
  includeSquareMeterPrice:boolean;
  hiddenColumns:Set<string>;
};

const textField=(key:keyof Listing,label:string,width:number):ExportField=>({key,label,width,kind:"text"});
const numberField=(key:keyof Listing,label:string,width:number,format:string):ExportField=>({key,label,width,kind:"number",format});

export function buildExcelExport(rows:Listing[],options:ExcelExportOptions){
  const fields:ExportField[]=[
    textField("listingId","رقم الإعلان",16),textField("status","الحالة",14),textField("propertyType","نوع العقار",14),textField("age","العمر",12),
    textField("city","المدينة",16),textField("neighborhood","الحي",20),numberField("price","السعر",16,"#,##0"),
  ];
  if(options.includeSquareMeterPrice)fields.push(numberField("sqmPrice","سعر المتر",15,"#,##0.00"));
  if(options.purpose!=="rent")fields.push(numberField("income","الدخل السنوي",17,"#,##0"),numberField("yieldPct","العائد %",12,"0.00"));
  fields.push(numberField("area","المساحة",14,"#,##0.00"));
  if(!options.hiddenColumns.has("count"))fields.push(numberField(options.roomMode?"rooms":"apartments",options.roomMode?"الغرف مع المجلس والمقلط":"الشقق",options.roomMode?24:12,"#,##0"));
  if(options.propertyType==="عمارة")fields.push(numberField("housingUnits","وحدة سكنية",15,"#,##0"),numberField("commercialShops","المحلات التجارية",18,"#,##0"),numberField("totalRooms","إجمالي الغرف",15,"#,##0"));
  if(!options.hiddenColumns.has("meters"))fields.push(numberField("meters","العدادات",12,"#,##0"));
  if(!options.hiddenColumns.has("floors"))fields.push(numberField("floors","الأدوار",11,"#,##0"));
  fields.push(numberField("street","عرض الشارع",14,"#,##0"));
  if(!options.hiddenColumns.has("density"))fields.push(numberField("density","شقق لكل 100م²",17,"0.00"));
  fields.push(textField("url","رابط الإعلان",48));

  const header=fields.map<ExportCell>(field=>({value:field.label,type:String,fontWeight:"bold",backgroundColor:"#0B5D50",textColor:"#FFFFFF",align:"center",alignVertical:"center",wrap:true,height:28}));
  const data=rows.map(row=>fields.map<ExportCell>(field=>{
    const value=row[field.key];
    if(field.kind==="number"&&typeof value==="number")return{value,type:Number,format:field.format,align:"right",alignVertical:"center"};
    return{value:value==null||value===""?"غير مذكور":String(value),type:String,format:"@",align:"right",alignVertical:"center",wrap:field.key==="url"};
  }));
  return{
    sheetData:[header,...data],
    sheetOptions:{sheet:"نتائج العقارات",columns:fields.map(field=>({width:field.width})),stickyRowsCount:1,rightToLeft:true,orientation:"landscape" as const,showGridLines:false,zoomScale:0.9},
  };
}
