from supabase import create_client, Client
from dotenv import load_dotenv
import os

load_dotenv()

supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_API_KEY"))

new_row = { 'email': 'mnani@umes.edu', 'role': 'ADMIN'}
supabase.table('admins-table').insert(new_row).execute()

results = supabase.table('admins-table').select('*').execute()
print(results)