# Deploy Klaviyo MCP Server to Render

## Quick Deploy (5 minutes)

### 1. Push Code to GitHub

```bash
cd /Users/varnikachabria/work/omni/Omni

# Make sure you're on your main branch
git status

# Add the MCP server files
git add mcp-servers/klaviyo/
git commit -m "Add Klaviyo MCP server"
git push origin main
```

### 2. Create Web Service on Render

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository (if not already connected)
4. Select your repository: `Omni` (or whatever your repo is called)

### 3. Configure the Service

Fill in these settings:

```
Name: klaviyo-mcp
Region: Oregon (or closest to you)
Branch: main
Root Directory: mcp-servers/klaviyo
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm run start:http
Instance Type: Starter ($7/month) or Free
```

### 4. Add Environment Variable

Click **"Advanced"** → **"Add Environment Variable"**

```
Key: KLAVIYO_API_KEY
Value: pk_10e1290bef3c8f93f0a8688aeb6b5d8baf
```

(Keep this secret! Don't share publicly)

### 5. Deploy!

Click **"Create Web Service"**

Render will:
- Clone your repo
- Install dependencies
- Build TypeScript
- Start the server

Wait 2-3 minutes for deploy to complete.

### 6. Get Your URL

Once deployed, you'll see a URL like:
```
https://klaviyo-mcp.onrender.com
```

### 7. Test It

```bash
curl https://klaviyo-mcp.onrender.com/health
```

Should return:
```json
{"status":"healthy","service":"klaviyo-mcp-server"}
```

### 8. Connect in Omni

Go to Omni UI and add MCP connection:

```
Transport Method: SSE
Name: Klaviyo
URL: https://klaviyo-mcp.onrender.com/sse
                                         ^^^^ Don't forget /sse!
```

Click "Test Connection" - you should see **14 tools**! 🎉

## Troubleshooting

### Deploy Failed?

Check build logs in Render dashboard. Common issues:
- Missing `package.json` → Make sure root directory is `mcp-servers/klaviyo`
- Build errors → Check that TypeScript compiles locally first

### Health Check Fails?

- Wait a minute after deploy completes
- Check service logs in Render
- Make sure `KLAVIYO_API_KEY` is set

### Still No Tools in Omni?

- Double-check URL ends with `/sse`
- Check Render logs for connection attempts
- Make sure Klaviyo API key is valid

## Free Tier Notes

Render's free tier:
- ✅ Works great for testing
- ⚠️ Spins down after 15 minutes of inactivity
- ⚠️ Takes ~30 seconds to wake up on first request

For production, upgrade to Starter ($7/month) for always-on service.

## Next Steps

Once deployed and connected:
1. ✅ Tools will persist (no more ngrok restarts!)
2. ✅ Works from anywhere (Render is in the cloud)
3. ✅ Can share with team members
4. ✅ Can add to multiple agents

Enjoy your Klaviyo integration! 🚀

