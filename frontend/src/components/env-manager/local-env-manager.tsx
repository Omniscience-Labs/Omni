"use client";

import { Eye, EyeOff } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { isLocalMode } from "@/lib/config";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/lib/api-client";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

interface APIKeyForm {
    [key: string]: string;
}

export function LocalEnvManager() {
  const queryClient = useQueryClient();
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const {data: apiKeys, isLoading} = useQuery({
    queryKey: ['api-keys'],
    queryFn: async() => {
      const response = await backendApi.get('/env-vars');
      return response.data;
    },
    enabled: isLocalMode()
  });

  const { register, handleSubmit, formState: { errors, isDirty }, reset } = useForm<APIKeyForm>({
    defaultValues: apiKeys || {}
  });

  const handleSave = async (data: APIKeyForm) => {
    updateApiKeys.mutate(data);
  }
  const updateApiKeys = useMutation({
    mutationFn: async (data: APIKeyForm) => {
      const response = await backendApi.post('/env-vars', data);
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: () => {
      toast.error('Failed to update API keys');
    }
  });

  const keysArray = apiKeys ? Object.entries(apiKeys).map(([key, value]) => ({
    id: key,
    name: key,
    value: value
  })) : [];

  useEffect(() => {
      if (apiKeys) {
        reset(apiKeys);
      }
  }, [apiKeys, reset]);

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => ({
      ...prev,
      [keyId]: !prev[keyId]
    }));
  }

  if (isLoading) {
    return <Card>
      <CardHeader>
        <CardTitle>Local .Env Manager</CardTitle>
        <CardDescription>Loading...</CardDescription>
      </CardHeader>
    </Card>;
  }

  return <Card>
    <CardHeader>
      <CardTitle>Local .Env Manager</CardTitle>
      <CardDescription>
        {isLocalMode() ? (
          <>
            Manage your local environment variables
          </>
        ) : (
          <>
            Local .Env Manager is only available in local mode.
          </>
        )}
      </CardDescription>
    </CardHeader>

    {isLocalMode() && (
        <CardContent>
            <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
                {keysArray && keysArray?.map(key => (
                  
                    <div key={key.id} className="space-y-2">
                        <Label htmlFor={key.id}>{key.name}</Label>
                        <div className="relative">  
                            <Input 
                              id={key.id} 
                              type={visibleKeys[key.id] ? 'text' : 'password'}
                              placeholder={key.name}
                              {...register(key.id)}
                            />
                            <Button 
                              type="button" 
                              variant="ghost" 
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => toggleKeyVisibility(key.id)}>
                                {visibleKeys[key.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                        {errors[key.id] && <p className="text-red-500">{errors[key.id]?.message}</p>}
                    </div>
                    
                ))}
                
                <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      variant="default"
                      disabled={!isDirty}
                    >Save</Button>
                </div>
            </form>
        </CardContent>
    )}
  </Card>
}