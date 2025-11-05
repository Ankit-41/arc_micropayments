import { Creator } from '../../models/index.js'

export async function getMenu(req, res){
  const creator = await Creator.findById(req.params.id)
  if(!creator) return res.status(404).json({ error: 'not found' })
  res.json({ menu: creator.menu, trustScore: creator.trustScore, reputation: creator.reputation, creatorId: creator._id })
}

export async function updateMenu(req, res){
  const { menu } = req.body
  const creator = await Creator.findByIdAndUpdate(req.params.id, { $set: { menu } }, { new: true })
  res.json({ creator })
}
