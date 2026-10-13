const metadata=new Set(['id','revision','createdAt','updatedAt','reviewedAt']);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Three-way merge: only independent edits merge automatically. Arrays stay whole.
export function mergeRecord(base,mine,current){
 const merged=structuredClone(current),conflicts=[];
 const keys=new Set([...Object.keys(base),...Object.keys(mine),...Object.keys(current)]);
 for(const key of keys){
  if(metadata.has(key))continue;
  const changedHere=!equal(base[key],mine[key]),changedElsewhere=!equal(base[key],current[key]);
  if(changedHere && changedElsewhere && !equal(mine[key],current[key]))conflicts.push({key,base:base[key],mine:mine[key],current:current[key]});
  else if(changedHere){if(mine[key]===undefined)delete merged[key];else merged[key]=structuredClone(mine[key]);}
 }
 return {merged,conflicts};
}
export function applyChoices(merge,choices){
 const result=structuredClone(merge.merged);
 for(const field of merge.conflicts){const choice=choices[field.key];if(!['mine','current'].includes(choice))throw Error('Choose a value for every conflicting field');const value=field[choice];if(value===undefined)delete result[field.key];else result[field.key]=structuredClone(value);}
 return result;
}
