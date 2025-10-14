'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
    icon_name: null as string | null,
    icon_color: '#000000',
    icon_background: '#e5e5e5',
  });


  const [originalFormData, setOriginalFormData] = useState(formData);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!agent) return;

    let configSource = agent;
    if (versionData) {
      configSource = {
        ...agent,
        ...versionData,
        icon_name: versionData.icon_name || agent.icon_name,
        icon_color: versionData.icon_color || agent.icon_color,
        icon_background: versionData.icon_background || agent.icon_background,
      };
    }

    const newFormData = {
      name: configSource.name || '',
        system_prompt: formData.system_prompt,
        agentpress_tools: formData.agentpress_tools,
      };

    { id: 'triggers', label: 'Triggers', icon: Zap, disabled: false },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-5xl h-[85vh] overflow-hidden p-0 gap-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex-shrink-0"
                >
                  {isSunaAgent ? (
                    <AgentAvatar
                      isSunaDefault={true}
                      agentName={formData.name}
                      size={40}
                      className="ring-1 ring-border"
                    />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🎯 Icon clicked in config dialog - opening editor');
                        console.log('Current formData:', { 
                          icon_name: formData.icon_name, 
                          icon_color: formData.icon_color, 
                          icon_background: formData.icon_background 
                        });
                        setIsIconEditorOpen(true);
                      }}
                      className="cursor-pointer transition-all hover:scale-105 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg"
                      type="button"
                      title="Click to customize agent icon"
                    >
                      <AgentAvatar
                        iconName={formData.icon_name}
                        iconColor={formData.icon_color}
                        backgroundColor={formData.icon_background}
                        agentName={formData.name}
                        size={40}
                        className="ring-1 ring-border hover:ring-foreground/20 transition-all"
                      />
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {isEditingName ? (
                      // Name editing mode (takes priority over everything)
                      <div className="flex items-center gap-2">
                        <Input
                          ref={nameInputRef}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleNameSave();
                            } else if (e.key === 'Escape') {
                              setEditName(formData.name);
                              setIsEditingName(false);
                            }
                          }}
                          className="h-8 w-64"
                          maxLength={50}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={handleNameSave}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditName(formData.name);
                            setIsEditingName(false);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : onAgentChange ? (
                      // When agent switching is enabled, show a sleek inline agent selector
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-2 hover:bg-muted/50 rounded-md px-2 py-1 transition-colors group">
                              <DialogTitle className="text-xl font-semibold truncate">
                                {isLoading ? 'Loading...' : formData.name || 'Agent'}
                              </DialogTitle>
                              <ChevronDown className="h-4 w-4 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent 
                            className="w-80 p-0" 
                            align="start"
                            sideOffset={4}
                          >
                            <div className="p-3 border-b">
                              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Search className="h-4 w-4" />
                                Switch Agent
                              </div>
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                              {agents.map((agent: any) => (
                                <DropdownMenuItem
                                  key={agent.agent_id}
                                  onClick={() => onAgentChange(agent.agent_id)}
                                  className="p-3 flex items-center gap-3 cursor-pointer"
                                >
                                  <AgentAvatar
                                    iconName={agent.icon_name}
                                    iconColor={agent.icon_color}
                                    backgroundColor={agent.icon_background}
                                    agentName={agent.name}
                                    isSunaDefault={agent.metadata?.is_suna_default}
                                    size={24}
                                    className="flex-shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{agent.name}</div>
                                    {agent.description && (
                                      <div className="text-xs text-muted-foreground truncate">
                                        {agent.description}
                                      </div>
                                    )}
                                  </div>
                                  {agent.agent_id === agentId && (
                                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                                  )}
                                </DropdownMenuItem>
                              ))}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* Add edit button for name editing when agent switching is enabled */}
                        {isNameEditable && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={() => {
                              setIsEditingName(true);
                              setTimeout(() => {
                                nameInputRef.current?.focus();
                                nameInputRef.current?.select();
                              }, 0);
                            }}
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      // Static title mode (no agent switching available)
                      <div className="flex items-center gap-2">
                        <DialogTitle className="text-xl font-semibold">
                          {isLoading ? 'Loading...' : formData.name || 'Agent'}
                        </DialogTitle>
                        {isNameEditable && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              setIsEditingName(true);
                              setTimeout(() => {
                                nameInputRef.current?.focus();
                                nameInputRef.current?.select();
                              }, 0);
                            }}
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <AgentVersionSwitcher
                  agentId={agentId}
                  currentVersionId={agent?.current_version_id || null}
                  currentFormData={{
                    system_prompt: formData.system_prompt,
                    configured_mcps: formData.configured_mcps,
                    custom_mcps: formData.custom_mcps,
                    agentpress_tools: formData.agentpress_tools,
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExport}
                  disabled={exportMutation.isPending}
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </DialogHeader>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="flex-1 flex flex-col min-h-0">
              <div className='flex items-center justify-center w-full'>
                <TabsList className="mt-4 w-[95%] flex-shrink-0">
                  {tabItems.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <TabsTrigger
                        key={tab.id}
                        value={tab.id}
                        disabled={tab.disabled}
                        className={cn(
                          tab.disabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>
              <div className="flex-1 overflow-auto">
                {/* <TabsContent value="general" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 gap-6">
                    <div className="flex-shrink-0">
                      <Label className="text-base font-semibold mb-3 block">Model</Label>
                      <AgentModelSelector
                        value={formData.model}
                        onChange={handleModelChange}
                        disabled={isViewingOldVersion}
                        variant="default"
                      />
                    </div>

                  </div>
                </TabsContent> */}

                <TabsContent value="instructions" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 min-h-0">
                    <Label className="text-base font-semibold mb-3 block flex-shrink-0">System Prompt</Label>
                    <ExpandableMarkdownEditor
                      value={formData.system_prompt}
                      onSave={handleSystemPromptChange}
                      disabled={!isSystemPromptEditable}
                      placeholder="Define how your agent should behave..."
                      className="flex-1 h-[90%]"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="tools" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 min-h-0 h-full">
                    <GranularToolConfiguration
                      tools={formData.agentpress_tools}
                      onToolsChange={handleToolsChange}
                      disabled={!areToolsEditable}
                      isSunaAgent={isSunaAgent}
                      isLoading={isLoading}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="integrations" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 min-h-0 h-full">
                    <AgentMCPConfiguration
                      configuredMCPs={formData.configured_mcps}
                      customMCPs={formData.custom_mcps}
                      onMCPChange={handleMCPChange}
                      agentId={agentId}
                      versionData={{
                        configured_mcps: formData.configured_mcps,
                        custom_mcps: formData.custom_mcps,
                        system_prompt: formData.system_prompt,
                        agentpress_tools: formData.agentpress_tools
                      }}
                      saveMode="callback"
                      isLoading={updateAgentMCPsMutation.isPending}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="knowledge" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 min-h-0 h-full">
                    <AgentKnowledgeBaseManager agentId={agentId} agentName={formData.name || 'Agent'} />
                  </div>
                </TabsContent>

                <TabsContent value="triggers" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 min-h-0 h-full">
                    <AgentTriggersConfiguration agentId={agentId} />
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          )}

          <DialogFooter className="px-6 py-4 border-t bg-background flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={!hasChanges || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentIconEditorDialog
        isOpen={isIconEditorOpen}
        onClose={() => {
          console.log('Icon editor dialog closing');
          setIsIconEditorOpen(false);
        }}
        currentIconName={formData.icon_name}
        currentIconColor={formData.icon_color}
        currentBackgroundColor={formData.icon_background}
        agentName={formData.name}
        agentDescription={agent?.description}
        onIconUpdate={handleIconChange}
      />
    </>
  );
}
