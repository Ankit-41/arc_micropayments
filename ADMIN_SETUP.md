# Admin Setup Instructions

## Creating an Admin User via Postman

To create an admin user, make a POST request to the `/auth/ensure-admin` endpoint.

### Request Details

**Method:** `POST`  
**URL:** `http://localhost:4000/auth/ensure-admin`

### Request Body (JSON)

```json
{
  "key": "YOUR_ADMIN_SETUP_KEY",
  "email": "admin@example.com",
  "password": "your-secure-password"
}
```

### Postman Steps

1. Create a new **POST** request
2. URL: `http://localhost:4000/auth/ensure-admin`
3. Go to **Body** tab → Select **raw** → Choose **JSON**
4. Paste:
   ```json
   {
     "key": "your-admin-setup-key-from-env",
     "email": "admin@example.com",
     "password": "SecurePassword123!"
   }
   ```
5. Click **Send**

### Notes

- Set `ADMIN_SETUP_KEY` in your `.env` file first
- If user exists, role becomes 'admin' and password updates
- If user doesn't exist, a new admin is created

