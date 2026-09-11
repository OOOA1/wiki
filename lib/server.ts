import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import type {Article,Member,Section,Invitation,WikiState} from './types';
import {seedSections,seedArticles} from './seed';
import {validateContent} from './content';
export class AppError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status}}
export function db():D1Database {if(!env.DB)throw new AppError('Общая база временно недоступна. Попробуйте ещё раз.',503);return env.DB}
export function bucket():R2Bucket {if(!env.BUCKET)throw new AppError('Хранилище файлов временно недоступно.',503);return env.BUCKET}
export function response(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export function errorResponse(error:unknown){if(error instanceof AppError)return response({error:error.message},error.status);console.error('Wiki request failed',error instanceof Error?error.message:'Unknown error');return response({error:'Не удалось выполнить действие. Ваш текст остаётся в редакторе. Попробуйте ещё раз.'},503)}
export function checkWrite(request:Request){const origin=request.headers.get('origin');if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==new URL(request.url).origin))throw new AppError('Запрос с другого сайта отклонён.',403)}
export async function identity(){const user=await getChatGPTUser();if(!user)throw new AppError('Войдите через ChatGPT, чтобы открыть вики.',401);return user}
export async function member(bootstrap=false):Promise<Member>{
 const user=await identity();const d=db();
 if(bootstrap){
  // Initial owner can be established only while the newly deployed Site is owner-private.
  await d.prepare('INSERT OR IGNORE INTO wiki_settings (id,owner_id,seeded) VALUES (1,?,0)').bind(user.userId).run();
  const setting=await d.prepare('SELECT owner_id,seeded FROM wiki_settings WHERE id=1').first<{owner_id:string;seeded:number}>();
  if(setting?.owner_id===user.userId){
   await d.prepare("INSERT OR IGNORE INTO members (id,name,email,role,active,created_at) VALUES (?,?,?,'admin',1,?)").bind(user.userId,user.fullName||user.email.split('@')[0],user.email,Date.now()).run();
   if(!setting.seeded){const now=Date.now();const stmts:D1PreparedStatement[]=[];seedSections.forEach((s,i)=>stmts.push(d.prepare('INSERT OR IGNORE INTO sections (id,name,description,color,icon,position) VALUES (?,?,?,?,?,?)').bind(s.id,s.name,s.description,s.color,s.icon,i)));seedArticles.forEach((a,i)=>stmts.push(d.prepare("INSERT OR IGNORE INTO articles (id,title,section_id,content,format,excerpt,tags,status,pinned,author_id,author_name,updated_by,updated_name,created_at,updated_at,version,is_example) VALUES (?,?,?,?,'markdown',?,?,'published',?,?,'Кафедра',?,'Кафедра',?,?,1,1)").bind(a.id,a.title,a.section,a.content,a.excerpt,JSON.stringify(a.tags),a.pinned,user.userId,user.userId,now-i*1000,now-i*1000)));stmts.push(d.prepare('UPDATE wiki_settings SET seeded=1 WHERE id=1'));await d.batch(stmts);}
  }
 }
 const m=await d.prepare('SELECT * FROM members WHERE id=? AND active=1').bind(user.userId).first<Member>();
 if(!m)throw new AppError('Для входа нужен токен приглашения.',403);return m;
}
export function canEdit(m:Member){if(m.role==='viewer')throw new AppError('У вас доступ только для чтения.',403)}
export function admin(m:Member){if(m.role!=='admin')throw new AppError('Это действие доступно администратору.',403)}
export function decodeArticle(row:Record<string,unknown>):Article {return {...row,tags:JSON.parse(String(row.tags||'[]')),bookmarked:!!row.bookmarked} as Article}
export async function getArticle(id:string,m:Member){const row=await db().prepare('SELECT a.*,EXISTS(SELECT 1 FROM bookmarks b WHERE b.article_id=a.id AND b.member_id=?) AS bookmarked FROM articles a WHERE a.id=?').bind(m.id,id).first<Record<string,unknown>>();if(!row)throw new AppError('Статья не найдена.',404);const a=decodeArticle(row);if(a.status==='draft'&&a.author_id!==m.id&&m.role!=='admin')throw new AppError('Этот черновик доступен только автору.',403);return a}
export async function loadWiki(m:Member):Promise<WikiState>{const d=db();const [sections,articles,members,invitations]=await Promise.all([
 d.prepare('SELECT * FROM sections ORDER BY position,name').all<Section>(),
 d.prepare("SELECT a.id,a.title,a.section_id,a.format,a.excerpt,a.tags,a.status,a.pinned,a.author_id,a.author_name,a.updated_by,a.updated_name,a.created_at,a.updated_at,a.version,a.is_example,'' AS content,EXISTS(SELECT 1 FROM bookmarks b WHERE b.article_id=a.id AND b.member_id=?) AS bookmarked FROM articles a WHERE a.status='published' OR a.author_id=? OR ?='admin' ORDER BY a.updated_at DESC").bind(m.id,m.id,m.role).all<Record<string,unknown>>(),
 d.prepare('SELECT id,name,role,active,created_at,invitation_id FROM members WHERE active=1 ORDER BY created_at').all<Member>(),
 m.role==='admin'?d.prepare('SELECT id,label,role,max_uses,uses,expires_at,created_at,revoked FROM invitations ORDER BY created_at DESC').all<Invitation>():Promise.resolve({results:[]})
 ]);return {me:m,sections:sections.results,articles:articles.results.map(decodeArticle),members:members.results,invitations:invitations.results}}
export async function hashToken(token:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}
export function randomToken(){return 'kfd_'+Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')}
export function renderArticle(a:Article){return {...a,html:validateContent(a.content,a.format).html}}
