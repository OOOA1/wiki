import {z} from 'zod';
import {AppError,admin,canEdit,checkWrite,db,errorResponse,getArticle,hashToken,identity,loadWiki,member,randomToken,renderArticle,response} from '@/lib/server';
import {excerpt,validateContent,MAX_CONTENT} from '@/lib/content';
import type {Invitation,Member} from '@/lib/types';
export const dynamic='force-dynamic';
const articleSchema=z.object({id:z.string().min(1).max(100),title:z.string().trim().min(1,'Укажите название статьи.').max(180),section_id:z.string().min(1),content:z.string().max(MAX_CONTENT),format:z.enum(['markdown','html']),tags:z.array(z.string().trim().min(1).max(32)).max(10),status:z.enum(['published','draft']),version:z.number().int().min(0),upload_ids:z.array(z.string().max(100)).max(100).default([])});
const sectionSchema=z.object({id:z.string().max(100).optional(),name:z.string().trim().min(1,'Укажите название раздела.').max(70),description:z.string().trim().max(160),color:z.enum(['purple','blue','orange','green']),icon:z.enum(['code','graduation','library','users'])});
export async function GET(request:Request){try{const m=await member(true);const url=new URL(request.url);const id=url.searchParams.get('id');if(id)return response({article:renderArticle(await getArticle(id,m))});if(url.searchParams.get('history')){const id=url.searchParams.get('history')!;await getArticle(id,m);const result=await db().prepare('SELECT id,title,content,format,version,author_name,created_at FROM revisions WHERE article_id=? ORDER BY version DESC LIMIT 30').bind(id).all();return response({revisions:result.results})}return response(await loadWiki(m))}catch(e){return errorResponse(e)}}
export async function POST(request:Request){try{
 checkWrite(request);if(!request.headers.get('content-type')?.includes('application/json'))throw new AppError('Ожидался JSON.');
 if(Number(request.headers.get('content-length')||0)>2000000)throw new AppError('Запрос слишком большой.',413);
 const raw=await request.text();if(raw.length>1200000)throw new AppError('Запрос слишком большой.',413);
 let body;try{body=JSON.parse(raw)}catch{throw new AppError('Некорректный JSON.')}
 const action=body.action;const d=db();const now=Date.now();
 if(action==='accept_invitation'){
  const user=await identity();const input=z.object({token:z.string().regex(/^kfd_[a-f0-9]{64}$/,'Проверьте токен приглашения.'),name:z.string().trim().min(1).max(70)}).parse(body);
  const existing=await d.prepare('SELECT * FROM members WHERE id=? AND active=1').bind(user.userId).first();if(existing)return response({ok:true});
  const hash=await hashToken(input.token);const invitation=await d.prepare('SELECT * FROM invitations WHERE token_hash=? AND revoked=0 AND expires_at>? AND uses<max_uses').bind(hash,now).first<Invitation>();if(!invitation)throw new AppError('Токен недействителен, отозван или уже использован.',403);
  // changes() is connection-local; D1 batch runs these statements transactionally in order.
  const res=await d.batch([
   d.prepare('UPDATE invitations SET uses=uses+1 WHERE id=? AND revoked=0 AND expires_at>? AND uses<max_uses AND NOT EXISTS(SELECT 1 FROM members WHERE id=? AND active=1)').bind(invitation.id,now,user.userId),
   d.prepare('INSERT INTO members (id,name,email,role,active,created_at,invitation_id) SELECT ?,?,?,?,1,?,? WHERE changes()=1 ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,active=1,invitation_id=excluded.invitation_id').bind(user.userId,input.name,user.email,invitation.role,now,invitation.id)
  ]);if(!res[0].meta.changes)throw new AppError('Токен уже использован или отозван.',403);return response({ok:true});
 }
 const m=await member();
 if(action==='save_article'){
  canEdit(m);const a=articleSchema.parse(body);const section=await d.prepare('SELECT id FROM sections WHERE id=?').bind(a.section_id).first();if(!section)throw new AppError('Выберите существующий раздел.');
  const validation=validateContent(a.content,a.format);if(a.status==='published'&&!validation.html.replace(/<[^>]*>/g,'').trim()&&!/<(?:img|video)\b/.test(validation.html))throw new AppError('Добавьте текст или вложение перед публикацией.');
  // HTML is stored sanitized. Markdown remains editable source and is sanitized on every render.
  const content=a.format==='html'?validation.html:a.content;const summary=excerpt(content,a.format);
  if(a.version===0){try{await d.prepare('INSERT INTO articles (id,title,section_id,content,format,excerpt,tags,status,pinned,author_id,author_name,updated_by,updated_name,created_at,updated_at,version,is_example) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,1,0)').bind(a.id,a.title,a.section_id,content,a.format,summary,JSON.stringify(a.tags),a.status,m.id,m.name,m.id,m.name,now,now).run()}catch(e){if(String(e).includes('UNIQUE'))throw new AppError('Статья уже создана. Обновите список.',409);throw e}}
  else {const existing=await getArticle(a.id,m);if(existing.version!==a.version)throw new AppError('Статью уже изменил другой участник. Скопируйте ваш текст, затем откройте актуальную версию.',409);
   const result=await d.batch([
    d.prepare('UPDATE articles SET title=?,section_id=?,content=?,format=?,excerpt=?,tags=?,status=?,updated_by=?,updated_name=?,updated_at=?,version=version+1,is_example=0 WHERE id=? AND version=?').bind(a.title,a.section_id,content,a.format,summary,JSON.stringify(a.tags),a.status,m.id,m.name,now,a.id,a.version),
    d.prepare('INSERT INTO revisions (id,article_id,title,content,format,version,author_name,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),existing.id,existing.title,existing.content,existing.format,existing.version,existing.updated_name,existing.updated_at)
   ]);if(!result[0].meta.changes)throw new AppError('Появилась новая версия статьи. Ваш текст сохранён в редакторе; откройте актуальную статью перед повторным сохранением.',409);
  }
  if(a.upload_ids.length)await d.batch(a.upload_ids.map(id=>d.prepare('UPDATE uploads SET article_id=? WHERE id=? AND member_id=? AND article_id IS NULL').bind(a.id,id,m.id)));
  return response({article:renderArticle(await getArticle(a.id,m)),warnings:validation.warnings});
 }
 if(action==='bookmark') {const a=await getArticle(String(body.id),m);if(body.saved)await d.prepare('INSERT OR IGNORE INTO bookmarks (member_id,article_id) VALUES (?,?)').bind(m.id,a.id).run();else await d.prepare('DELETE FROM bookmarks WHERE member_id=? AND article_id=?').bind(m.id,a.id).run();return response({ok:true})}
 if(action==='pin_article'){canEdit(m);const a=await getArticle(String(body.id),m);await d.prepare('UPDATE articles SET pinned=? WHERE id=?').bind(body.pinned?1:0,a.id).run();return response({ok:true})}
 if(action==='delete_article'){canEdit(m);const a=await getArticle(String(body.id),m);if(m.role!=='admin'&&a.author_id!==m.id)throw new AppError('Удалить статью может автор или администратор.',403);await d.prepare('DELETE FROM articles WHERE id=?').bind(a.id).run();return response({ok:true})}
 if(action==='save_section'){canEdit(m);const s=sectionSchema.parse(body);const id=s.id||crypto.randomUUID();if(s.id){const result=await d.prepare('UPDATE sections SET name=?,description=?,color=?,icon=? WHERE id=?').bind(s.name,s.description,s.color,s.icon,id).run();if(!result.meta.changes)throw new AppError('Раздел не найден.',404)}else await d.prepare('INSERT INTO sections (id,name,description,color,icon,position) VALUES (?,?,?,?,?,(SELECT COALESCE(MAX(position),0)+1 FROM sections))').bind(id,s.name,s.description,s.color,s.icon).run();return response({id})}
 if(action==='delete_section'){admin(m);const id=z.string().min(1).parse(body.id);const count=await d.prepare('SELECT COUNT(*) AS n FROM articles WHERE section_id=?').bind(id).first<{n:number}>();if(count?.n)throw new AppError('Сначала перенесите или удалите статьи этого раздела.');await d.prepare('DELETE FROM sections WHERE id=?').bind(id).run();return response({ok:true})}
 if(action==='create_invitation'){admin(m);const input=z.object({label:z.string().trim().min(1).max(80),role:z.enum(['editor','viewer']),days:z.union([z.literal(1),z.literal(7),z.literal(30)]),max_uses:z.union([z.literal(1),z.literal(5),z.literal(10)])}).parse(body);const token=randomToken();const id=crypto.randomUUID();await d.prepare('INSERT INTO invitations (id,token_hash,label,role,max_uses,uses,expires_at,created_at,created_by,revoked) VALUES (?,?,?,?,?,0,?,?,?,0)').bind(id,await hashToken(token),input.label,input.role,input.max_uses,now+input.days*86400000,now,m.id).run();return response({token,id})}
 if(action==='revoke_invitation'){admin(m);await d.prepare('UPDATE invitations SET revoked=1 WHERE id=?').bind(String(body.id)).run();return response({ok:true})}
 if(action==='update_member'){admin(m);const input=z.object({id:z.string(),role:z.enum(['editor','viewer']).optional(),active:z.literal(0).optional()}).parse(body);const target=await d.prepare('SELECT * FROM members WHERE id=?').bind(input.id).first<Member>();if(!target)throw new AppError('Участник не найден.',404);if(target.role==='admin'||target.id===m.id)throw new AppError('Нельзя изменить доступ владельца.');if(input.active===0)await d.prepare('UPDATE members SET active=0 WHERE id=?').bind(input.id).run();else if(input.role)await d.prepare('UPDATE members SET role=? WHERE id=?').bind(input.role,input.id).run();return response({ok:true})}
 if(action==='profile'){const name=z.string().trim().min(1).max(70).parse(body.name);await d.prepare('UPDATE members SET name=? WHERE id=?').bind(name,m.id).run();return response({ok:true})}
 throw new AppError('Неизвестное действие.',400);
}catch(e){if(e instanceof z.ZodError)return response({error:e.issues[0]?.message||'Проверьте заполненные поля.'},400);return errorResponse(e)}}
